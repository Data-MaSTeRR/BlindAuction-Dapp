App = {
  web3Provider: null,
  contracts: {},
  url: 'http://127.0.0.1:7545',
  // network_id: 5777,

  biddingPhases: {  // event name
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
    // Modern dapp browsers...
    if (window.ethereum) {
      App.web3Provider = window.ethereum;
      window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(() => {
        console.log("Account access granted");
      })
      .catch((error) => {
        // User denied account access...
        console.error("User denied account access", error);
      });
    }
    // Legacy dapp browsers...
    else if (window.web3) {
      App.web3Provider = window.web3.currentProvider;
    }
    // If no injected web3 instance is detected, fall back to Ganache
    else {
      App.web3Provider = new Web3.providers.HttpProvider(App.url); // App.url is your fallback URL (e.g., http://localhost:7545)
    }
    
    web3 = new Web3(App.web3Provider);

    return App.initContract();
  },

  initContract: function () {
    $.getJSON('BlindAuction.json', function (data) {
      // Get the necessary contract artifact file and instantiate it with truffle-contract
      var auctionArtifact = data;
      App.contracts.auction = TruffleContract(auctionArtifact);
      // Set the provider for our contract
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

  getCurrentPhase: function() {
    App.contracts.auction.deployed().then(function(instance) {
      web3.eth.defaultAccount=web3.eth.accounts[0];
      return instance.currentPhase();
    }).then(function(result) {
      App.currentPhase = result;
      var notificationText = App.auctionPhases[App.currentPhase];
      console.log(App.currentPhase);
      console.log(notificationText);
      $('#phase-notification-text').text(notificationText);
      console.log("Phase set");
    })
  },

  handlePhase: function () {
    App.contracts.auction.deployed().then(function (instance) {
      web3.eth.defaultAccount=web3.eth.accounts[0];
      return instance.advancePhase();      
    }).then(function (result) {
      console.log("instance.advancePhase result");
        console.log(result);
        if (result) {
          if (parseInt(result.receipt.status) == 1) {
            if (result.logs.length > 0) {
              App.showNotification(result.logs[0].event);
            }
            else {
              App.showNotification("AuctionEnded");
            }
            App.contracts.auction.deployed().then(function(latestInstance) {
              return latestInstance.currentPhase();
            }).then(function(result) {
              console.log("This is also working, new phase updated")
              App.currentPhase = result;
            })
            return;
          }
          else {
            toastr["error"]("Error in changing to next Phase");
          }
        }
        else {
          toastr["error"]("Error in changing to next Phase");
        }
      })
      .catch(function (err) {
        toastr["error"]("Error in changing to next Phase");
        console.log(err)
      });
  },

  handleBid: function () {
    // event.preventDefault();
    var bidValue = $("#bet-value").val();
    var msgValue = $("#message-value").val();
    App.contracts.auction.deployed().then(function (instance) {
      bidInstance = instance;
      web3.eth.defaultAccount=web3.eth.accounts[0];
      return bidInstance.bid(bidValue, { value: web3.toWei(msgValue, "ether") });
    }).then(function (result) {
      if (result) {
        console.log(result.receipt.status);
        if (parseInt(result.receipt.status) == 1)
          toastr.info("Your Bid is Placed!", "", { "iconClass": 'toast-info notification0' });
        else
          toastr["error"]("Error in Bidding. Bidding Reverted!");
      } else {
        toastr["error"]("Bidding Failed!");
      }
    }).catch(function (err) {
      console.log(err);
      toastr["error"]("Bidding Failed!");
    });    
  },

  handleReveal: function () {
    console.log("reveal button clicked");
    // event.preventDefault();
    var bidRevealValue = $("#bet-reveal").val();
    console.log(bidRevealValue);
    console.log(parseInt(bidRevealValue));
    var bidRevealSecret = $("#password").val();
    console.log(bidRevealSecret);

    App.contracts.auction.deployed().then(function (instance) {
      bidInstance = instance;
      web3.eth.defaultAccount=web3.eth.accounts[0];
      return bidInstance.reveal(parseInt(bidRevealValue), bidRevealSecret);
    }).then(function (result) {
      if (result) {
        console.log(result.receipt.status);
        if (parseInt(result.receipt.status) == 1)
          toastr.info("Your Bid is Revealed!", "", { "iconClass": 'toast-info notification0' });
        else
          toastr["error"]("Error in Revealing. Bidding Reverted!");
      } else {
        toastr["error"]("Revealing Failed!");
      }
    }).catch(function (err) {
      console.log(err);
      toastr["error"]("Revealing Failed!");
    });    
  },

  handleWinner: function () {
    console.log("To get winner");
    var bidInstance;
    App.contracts.auction.deployed().then(function (instance) {
      bidInstance = instance;
      web3.eth.defaultAccount=web3.eth.accounts[0];
      return bidInstance.auctionEnd();
    }).then(function (res) {
      console.log(res);
      var winner = res.logs[0].args.winner;
      var highestBid = res.logs[0].args.highestBid.toNumber();
      toastr.info("Highest bid is " + highestBid + "<br>" + "Winner is " + winner, "", { "iconClass": 'toast-info notification3' });
    }).catch(function (err) {
      console.log(err.message);
      toastr["error"]("Error!");
    })
  },

  handleWithdraw: function() {
    console.log("Inside handleWithdraw")
    App.contracts.auction.deployed().then(function(instance) {
      web3.eth.defaultAccount=web3.eth.accounts[0];
      console.log("Trying to call withdraw with currentAccount: " + web3.eth.defaultAccount);
      return instance.withdraw();
    }).then(function(result) {
      if(result.receipt.status) {
        toastr.info('Your bid has been withdrawn');
      }  
    }).catch(function(error) {
      console.log(error.message);
      toastr["error"]("Error in withdrawing the bid");
    })
  },

  //Function to show the notification of auction phases
  showNotification: function (phase) {
    var notificationText = App.biddingPhases[phase];
    if (!notificationText) {
      console.error("Invalid phase:", phase);
      return;
    }
    $('#phase-notification-text').text(notificationText.text);
    toastr.info(notificationText.text, "", { "iconClass": 'toast-info notification' + String(notificationText.id) });
  }
};

$(function () {
  $(window).load(function () {
    App.init();
    //Notification UI config
    toastr.options = {
      "showDuration": "1000",
      "positionClass": "toast-top-left",
      "preventDuplicates": true,
      "closeButton": true
    };
  });
});
