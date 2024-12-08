App = {
  web3Provider: null,
  contracts: {},
  url: 'http://127.0.0.1:7545',

  biddingPhases: {
    "AuctionInit": { 'id': 0, 'text': "Bidding Not Started" },
    "BiddingStarted": { 'id': 1, 'text': "Bidding Started" },
    "RevealStarted": { 'id': 2, 'text': "Reveal Started" },
    "AuctionDone": { 'id': 3, 'text': "Auction Done" },
    "AuctionEnded": { 'id': 4, 'text': "Auction Ended" }
  },
  auctionPhases: {
    "0": "Bidding Not Started",
    "1": "Bidding Started",
    "2": "Reveal Started",
    "3": "Auction Done",
    "4": "Auction Ended"
  },

  init: function () {
    console.log("Checkpoint 0");
    return App.initWeb3();
  },

  initWeb3: function () {
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(() => {
        console.log("Account access granted");
      })
      .catch((error) => {
        console.error("User denied account access", error);
      });
    } else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    } else {
      App.web3Provider = new Web3.providers.HttpProvider(App.url);
    }
    web3 = new Web3(App.web3Provider);
    return App.initContract();
  },

  initContract: function () {
    $.getJSON('BlindAuction.json', function (data) {
      var auctionArtifact = data;
      App.contracts.auction = TruffleContract(auctionArtifact);
      App.contracts.auction.setProvider(App.web3Provider);
      App.getCurrentPhase();
      return App.bindEvents();
    });
  },

  bindEvents: function () {
    $(document).on('click', '#submit-bid', App.handleBid);
    $(document).on('click', '#submit-reveal', App.handleReveal);
    $(document).on('click', '#change-phase', App.handlePhase);
    $(document).on('click', '#withdraw-bid', App.handleWithdraw);
    $(document).on('click', '#generate-winner', App.handleWinner);
  },

  getCurrentPhase: function () {
    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount = web3.eth.accounts[0];
      return instance.currentPhase();
    }).then(function (result) {
      App.currentPhase = result;
      var notificationText = App.auctionPhases[App.currentPhase];
      $('#phase-notification-text').text(notificationText);
      App.updateProgressBar(App.currentPhase);
      console.log("Current phase updated:", notificationText);
    }).catch(function (err) {
      console.error("Error fetching phase:", err);
    });
  },

  handlePhase: function () {
    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount = web3.eth.accounts[0];
      return instance.advancePhase();
    }).then(function (result) {
      if (result.receipt.status === "1") {
        console.log("Phase advanced successfully.");
        App.getCurrentPhase();
      } else {
        toastr["error"]("Error in changing to next Phase");
      }
    }).catch(function (err) {
      console.error("Error in advancing phase:", err);
    });
  },

  handleBid: function () {
    var bidValue = $("#bet-value").val();
    var msgValue = $("#message-value").val();

    if (!/^[0-9A-Fa-f]{64}$/.test(bidValue)) {
      toastr["warning"]("Invalid bid format. Must be a 64-character hex string.");
      return;
    }

    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount = web3.eth.accounts[0];
      return instance.bid(bidValue, { value: web3.toWei(msgValue, "ether") });
    }).then(function (result) {
      if (result.receipt.status === "1") {
        toastr["success"]("Bid placed successfully!");
      } else {
        toastr["error"]("Error in placing bid.");
      }
    }).catch(function (err) {
      console.error("Error in bidding:", err);
      toastr["error"]("Bidding failed!");
    });
  },

  handleReveal: function () {
    var bidRevealValue = $("#bet-reveal").val();
    var bidRevealSecret = $("#password").val();

    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount = web3.eth.accounts[0];
      return instance.reveal(parseInt(bidRevealValue), bidRevealSecret);
    }).then(function (result) {
      if (result.receipt.status === "1") {
        toastr["success"]("Bid revealed successfully!");
      } else {
        toastr["error"]("Error in revealing bid.");
      }
    }).catch(function (err) {
      console.error("Error in revealing bid:", err);
      toastr["error"]("Revealing failed!");
    });
  },

  handleWinner: function () {
    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount = web3.eth.accounts[0];
      return instance.auctionEnd();
    }).then(function (result) {
      var winner = result.logs[0].args.winner;
      var highestBid = web3.fromWei(result.logs[0].args.highestBid, "ether");
      toastr["info"](`Auction ended! Winner: ${winner}, Highest Bid: ${highestBid} ETH`);
    }).catch(function (err) {
      console.error("Error in ending auction:", err);
      toastr["error"]("Failed to end auction.");
    });
  },

  handleWithdraw: function () {
    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount = web3.eth.accounts[0];
      return instance.withdraw();
    }).then(function (result) {
      if (result.receipt.status === "1") {
        toastr["success"]("Withdrawal successful!");
      } else {
        toastr["error"]("Error in withdrawing funds.");
      }
    }).catch(function (err) {
      console.error("Error in withdrawal:", err);
      toastr["error"]("Withdrawal failed!");
    });
  },

  updateProgressBar: function (phase) {
    const phaseMap = {
      "0": 25,
      "1": 50,
      "2": 75,
      "3": 100
    };
    const progress = phaseMap[phase.toString()] || 0;
    $('#progress-bar').css('width', `${progress}%`).attr('aria-valuenow', progress);
  }
};

$(function () {
  $(window).load(function () {
    App.init();
    toastr.options = {
      "showDuration": "1000",
      "positionClass": "toast-top-right",
      "preventDuplicates": true,
      "closeButton": true
    };
  });
});
