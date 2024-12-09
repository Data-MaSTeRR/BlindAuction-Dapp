// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract BlindAuction {
    struct Bid {
        bytes32 blindedBid; // 입찰 값과 비밀 값을 해시한 값
        uint deposit; // 입찰자가 예치한 금액
        bool revealed; // 입찰이 공개되었는지 여부
    }

    enum Phase {Init, Bidding, Reveal, Done} // 경매의 단계 (초기화, 입찰, 공개, 완료)

    address payable public beneficiary; // 경매 수혜자(수익을 받을 주소)
    address public highestBidder; // 현재 최고 입찰자
    uint public highestBid = 0; // 현재 최고 입찰 금액

    mapping(address => Bid) public bids; // 입찰 정보를 저장하는 매핑
    mapping(address => uint) public pendingReturns; // 반환 대기 중인 금액을 저장하는 매핑

    Phase public currentPhase = Phase.Init; // 현재 경매 단계 (초기값은 Init)

    // 이벤트 선언
    event AuctionInit(); // 경매 초기화 이벤트
    event BiddingStarted(); // 입찰 단계 시작 이벤트
    event RevealStarted(); // 공개 단계 시작 이벤트
    event AuctionDone(); // 경매 완료 이벤트
    event AuctionEnded(address winner, uint highestBid); // 경매 종료 이벤트 (승자와 최고 입찰 금액)
    event DebugLog( // 디버그 로그 이벤트
        string message, // 메시지
        address indexed caller, // 호출자 주소
        uint depositBefore, // 공개 전 입찰자의 예치금
        uint depositAfter, // 공개 후 입찰자의 예치금
        uint valueInWei, // 입찰 값 (Wei 단위)
        bool isValid, // 공개된 값의 유효성 여부
        uint difference, // 반환된 금액 차이
        bool success // 성공 여부
    );

    // 수혜자 전용 함수 제한자
    modifier onlyBeneficiary() {
        require(msg.sender == beneficiary, "Only beneficiary can call this."); // 수혜자만 호출 가능
        _;
    }

    // 특정 단계에서만 호출 가능 제한자
    modifier atPhase(Phase _phase) {
        require(currentPhase == _phase, "Function cannot be called at this time."); // 현재 단계와 일치해야 함
        _;
    }

    constructor() {
        beneficiary = payable(msg.sender); // 수혜자를 계약 배포자로 설정
        currentPhase = Phase.Init; // 명시적으로 초기화
        emit AuctionInit(); // 경매 초기화 이벤트 발생
    }

    function advancePhase() public onlyBeneficiary {
        require(currentPhase != Phase.Done, "Auction already ended."); // 완료 단계에서는 호출 불가

        if (currentPhase == Phase.Init) {
            currentPhase = Phase.Bidding; // 입찰 단계로 전환
            emit BiddingStarted(); // 입찰 시작 이벤트 발생
        } else if (currentPhase == Phase.Bidding) {
            currentPhase = Phase.Reveal; // 공개 단계로 전환
            emit RevealStarted(); // 공개 시작 이벤트 발생
        } else if (currentPhase == Phase.Reveal) {
            if (highestBidder == address(0)) {
                revert("No valid bids were revealed."); // 유효한 입찰이 없으면 오류 발생
            }
            currentPhase = Phase.Done; // 완료 단계로 전환
            emit AuctionDone(); // 경매 완료 이벤트 발생
            emit AuctionEnded(highestBidder, highestBid); // 경매 종료 이벤트 발생
        } else {
            revert("Invalid phase transition."); // 유효하지 않은 단계 전환 시 오류
        }
    }

    function bid(bytes32 blindBid) public payable atPhase(Phase.Bidding) {
        require(bids[msg.sender].blindedBid == 0, "Already bid."); // 이미 입찰한 경우 오류 발생
        require(msg.value > 0, "Deposit must be greater than 0."); // 예치금이 0보다 커야 함
        bids[msg.sender] = Bid({
            blindedBid: blindBid, // 블라인드 입찰 정보 저장
            deposit: msg.value, // 예치금 저장
            revealed: false // 초기에는 공개되지 않은 상태
        });
    }

    function reveal(uint value, bytes32 secret) public atPhase(Phase.Reveal) {
        Bid storage bidToCheck = bids[msg.sender]; // 입찰 정보 가져오기
        uint depositBefore = bidToCheck.deposit; // 공개 전 예치금 저장
        require(bidToCheck.blindedBid != 0, "No bid to reveal."); // 공개할 입찰 정보가 없는 경우 오류 발생
        require(!bidToCheck.revealed, "Already revealed."); // 이미 공개된 경우 오류 발생

        uint valueInWei = value * 1 ether; // ETH를 Wei 단위로 변환
        uint difference = 0; // 반환 금액 초기화
        bool success = false; // 성공 여부 초기화

        if (bidToCheck.blindedBid == keccak256(abi.encodePacked(valueInWei, secret))) {
            require(bidToCheck.deposit >= valueInWei, "Insufficient deposit for the value."); // 예치금이 입찰 값보다 적으면 오류 발생
            difference = bidToCheck.deposit - valueInWei; // 반환할 차액 계산

            if (valueInWei > highestBid) {
                if (highestBidder != address(0)) {
                    pendingReturns[highestBidder] += highestBid; // 이전 최고 입찰자에게 반환 예정 금액 추가
                }
                highestBidder = msg.sender; // 최고 입찰자 갱신
                highestBid = valueInWei; // 최고 입찰 금액 갱신
            } else {
                pendingReturns[msg.sender] += valueInWei; // 반환 예정 금액 추가
            }

            if (difference > 0) {
                payable(msg.sender).transfer(difference); // 남은 금액 반환
            }

            bidToCheck.deposit = 0; // 예치금 초기화
            success = true; // 성공 여부 갱신
        } else {
            pendingReturns[msg.sender] += bidToCheck.deposit; // 잘못된 공개 시 전체 예치금을 반환 예정 금액으로 추가
        }

        bidToCheck.revealed = true; // 공개 상태로 변경

        emit DebugLog(
            "Reveal result", // 디버그 메시지
            msg.sender, // 호출자
            depositBefore, // 공개 전 예치금
            bidToCheck.deposit, // 공개 후 예치금
            valueInWei, // 입찰 값 (Wei 단위)
            bidToCheck.blindedBid == keccak256(abi.encodePacked(valueInWei, secret)), // 유효성 검사 결과
            difference, // 반환 금액 차이
            success // 성공 여부
        );
    }

    function withdraw() public {
        uint amount = pendingReturns[msg.sender]; // 반환 예정 금액 가져오기
        require(amount > 0, "No funds to withdraw."); // 반환 금액이 없는 경우 오류 발생

        pendingReturns[msg.sender] = 0; // 재진입 방지를 위해 금액 초기화
        payable(msg.sender).transfer(amount); // 반환 금액 전송
    }

    function auctionEnd() public {
        require(currentPhase == Phase.Done, "Auction not yet done."); // 완료 단계가 아니면 호출 불가
        require(highestBidder != address(0), "No bids revealed."); // 입찰 공개가 없는 경우 오류 발생
        beneficiary.transfer(highestBid); // 최고 입찰 금액을 수혜자에게 전송
        emit AuctionEnded(highestBidder, highestBid); // 경매 종료 이벤트 발생
    }
}
