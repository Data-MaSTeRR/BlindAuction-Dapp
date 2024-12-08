// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract BlindAuction {
    struct Bid {
        bytes32 blindedBid;
        uint deposit;
        bool revealed;
    }

    enum Phase {Init, Bidding, Reveal, Done}

    address payable public beneficiary;
    address public highestBidder;
    uint public highestBid = 0;

    mapping(address => Bid) public bids;
    mapping(address => uint) public pendingReturns;

    Phase public currentPhase = Phase.Init;

    event AuctionInit();
    event BiddingStarted();
    event RevealStarted();
    event AuctionDone();
    event AuctionEnded(address winner, uint highestBid);
    event DebugLog(
        string message,
        address indexed caller,
        uint depositBefore,
        uint depositAfter,
        uint valueInWei,
        bool isValid,
        uint difference,
        bool success
    );


    modifier onlyBeneficiary() {
        require(msg.sender == beneficiary, "Only beneficiary can call this.");
        _;
    }

    modifier atPhase(Phase _phase) {
        require(currentPhase == _phase, "Function cannot be called at this time.");
        _;
    }

    constructor() {
        beneficiary = payable(msg.sender);
        currentPhase = Phase.Init; // 명시적으로 초기화
        emit AuctionInit();
    }

    function advancePhase() public onlyBeneficiary {
        require(currentPhase != Phase.Done, "Auction already ended.");

        if (currentPhase == Phase.Init) {
            currentPhase = Phase.Bidding;
            emit BiddingStarted();
        } else if (currentPhase == Phase.Bidding) {
            currentPhase = Phase.Reveal;
            emit RevealStarted();
        } else if (currentPhase == Phase.Reveal) {
            // 유효한 입찰자 검증
            if (highestBidder == address(0)) {
                revert("No valid bids were revealed."); // 유효한 입찰이 없을 경우 오류
            }
            currentPhase = Phase.Done;
            emit AuctionDone();
            emit AuctionEnded(highestBidder, highestBid);
        } else {
            revert("Invalid phase transition.");
        }
    }



    function bid(bytes32 blindBid) public payable atPhase(Phase.Bidding) {
        require(bids[msg.sender].blindedBid == 0, "Already bid.");
        require(msg.value > 0, "Deposit must be greater than 0.");
        bids[msg.sender] = Bid({
            blindedBid: blindBid,
            deposit: msg.value,
            revealed: false
        });
    }

    function reveal(uint value, bytes32 secret) public atPhase(Phase.Reveal) {
        Bid storage bidToCheck = bids[msg.sender];
        uint depositBefore = bidToCheck.deposit;
        require(bidToCheck.blindedBid != 0, "No bid to reveal.");
        require(!bidToCheck.revealed, "Already revealed.");

        uint valueInWei = value * 1 ether; // Convert ETH to Wei
        uint difference = 0;
        bool success = false;

        if (bidToCheck.blindedBid == keccak256(abi.encodePacked(valueInWei, secret))) {
            require(bidToCheck.deposit >= valueInWei, "Insufficient deposit for the value.");
            difference = bidToCheck.deposit - valueInWei;

            if (valueInWei > highestBid) {
                // Refund the previous highest bidder
                if (highestBidder != address(0)) {
                    pendingReturns[highestBidder] += highestBid;
                }
                highestBidder = msg.sender;
                highestBid = valueInWei;
            } else {
                pendingReturns[msg.sender] += valueInWei;
            }

            // Refund remaining deposit
            if (difference > 0) {
                payable(msg.sender).transfer(difference);
            }

            bidToCheck.deposit = 0; // Clear deposit
            success = true;
        } else {
            // Add entire deposit to pendingReturns for invalid reveal
            pendingReturns[msg.sender] += bidToCheck.deposit;
        }

        bidToCheck.revealed = true;

        emit DebugLog(
            "Reveal result",
            msg.sender,
            depositBefore,
            bidToCheck.deposit,
            valueInWei,
            bidToCheck.blindedBid == keccak256(abi.encodePacked(valueInWei, secret)),
            difference,
            success
        );
    }



    function withdraw() public {
        uint amount = pendingReturns[msg.sender];
        require(amount > 0, "No funds to withdraw.");

        // Prevent re-entrancy
        pendingReturns[msg.sender] = 0;

        // Transfer the pending amount
        payable(msg.sender).transfer(amount);
    }

    function auctionEnd() public {
        require(currentPhase == Phase.Done, "Auction not yet done.");
        require(highestBidder != address(0), "No bids revealed.");
        beneficiary.transfer(highestBid);
        emit AuctionEnded(highestBidder, highestBid);
    }
}
