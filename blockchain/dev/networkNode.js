const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const BlockChain = require('./blockchain');
const uuid = require('uuid/v1');
const port = process.argv[2];
const nodeAddress = uuid().split('-').join('');
const rp = require('request-promise');

const bitcoin = new BlockChain();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : false}));

app.get('/blockchain',(req,res)=>{
    res.send(bitcoin);
});

app.post('/transaction', (req,res)=>{
    const newTransaction = req.body;
    const blockIndex = bitcoin.addTransactionToPendingTransaction(newTransaction);
    res.json({note : `Transaction will be added in block ${blockIndex}.`});
});

app.post('/transaction/broadcast',(req,res)=>{
    const newTransaction = bitcoin.createNewTransaction(req.body.amount,req.body.sender,req.body.recipient);
    bitcoin.addTransactionToPendingTransaction(newTransaction);
    const requestPromises = [];
    bitcoin.networkNode.forEach(networkNodeUrl =>{

        const requestOptions = {
            uri : networkNodeUrl+ '/transaction',
            method : 'POST',
            body: newTransaction,
            json :true
        } ;
        requestPromises.push(rp(requestOptions));
    });
    Promise.all(requestPromises).then(data =>{
        res.json({note:'Transaction created and broadcast successfully'});
    });

});

app.get('/mine',(req,res)=>{
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock['hash'];

    const currentBlockData = {
        transactions : bitcoin.pendingTransactions,
        index: lastBlock['index'] + 1
    };
    const nonce = bitcoin.proofOfWork(previousBlockHash,currentBlockData);
    const blockHash = bitcoin.hashBlock(previousBlockHash,currentBlockData, nonce);

    const newBlock = bitcoin.createNewBlock(nonce,previousBlockHash,blockHash);
    const requestPromises = [];
    bitcoin.networkNode.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body : {newBlock : newBlock},
            json : true
        };
        requestPromises.push(rp(requestOptions));
    });
    Promise.all(requestPromises).then((data)=>{
        const requestOptions = {
            uri : bitcoin.currentNodeUrl + '/transaction/broadcast',
            method:'POST',
            body: {
                amount:12.5,
                sender:'000',
                recipient: nodeAddress
            },
            json:true
        };
        return rp(requestOptions);
    }).then((data)=>{
        res.json({
            note: "new block mined successfully",
            block: newBlock});
    });
});

app.post('/receive-new-block', (req,res)=>{
   const newBlock = req.body.newBlock;
   const lastBlock = bitcoin.getLastBlock();
   const correctHash = lastBlock.hash === newBlock.previousBlockHash;
   const correctIndex = lastBlock['index'] +1 === newBlock['index'];
   if(correctHash && correctIndex){
       bitcoin.chain.push(newBlock);
       bitcoin.pendingTransactions = [];
       res.json({note:'New block received and accepted',
       newBlock: newBlock});
   }else {
       res.json({note:'New Block rejected',
       newBlock: newBlock});
   }
});

app.post('/register-and-broadcast-node',(req,res)=>{
   const newNodeUrl = req.body.newNodeUrl;
   if(bitcoin.networkNode.indexOf(newNodeUrl) == -1)
       bitcoin.networkNode.push(newNodeUrl);
   const resisterNodePromises = [];
    bitcoin.networkNode.forEach( networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl+ '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl},
            json: true
        };
        resisterNodePromises.push(rp(requestOptions));
    });

    Promise.all(resisterNodePromises).then( data =>{
            const bulkRegisterOptions = {
                uri: newNodeUrl + '/register-node-bulk',
                method: 'POST',
                body: {allNetworkNodes: [ bitcoin.currentNodeUrl, ...bitcoin.networkNode]},
                json:true
            };

            return rp(bulkRegisterOptions);
    }).then((data)=>{
       res.json({note: "New node registered with network successfully"});
    });
});

app.post('/register-node',(req,res)=>{
    const newNodeUrl = req.body.newNodeUrl;
    const nodeNotAlreadyPresent = bitcoin.networkNode.indexOf(newNodeUrl) == -1;
    const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
    if(nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNode.push(newNodeUrl);
    res.json({note:"New node registered successfully."});
});

app.post('/register-node-bulk',(req,res)=>{
    const allNetworkNodes = req.body.allNetworkNodes;
    allNetworkNodes.forEach(networkNodeUrl => {
       const nodeNotAlreadyPresent = bitcoin.networkNode.indexOf(networkNodeUrl) == -1;
       const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
       if(nodeNotAlreadyPresent && notCurrentNode)  bitcoin.networkNode.push(networkNodeUrl);
    });
    res.json({note: 'Bulk registration successful'});
});

app.get('/consensus',(req,res)=>{
    requestPromises = [];
    bitcoin.networkNode.forEach(networkNodeUrl =>{
        const requestOptions = {
            uri : networkNodeUrl + '/blockchain',
            method: 'GET',
            json: true
        };
        requestPromises.push(rp(requestOptions));
    }) ;

    Promise.all(requestPromises).then((blockchains)=>{
        const currentChainLength = bitcoin.chain.length;
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingTransaction = null;
        blockchains.forEach(blockchain =>{
                if(blockchain.chain.length > maxChainLength){
                    maxChainLength = blockchain.chain.length;
                    newLongestChain = blockchain.chain;
                    newPendingTransaction = blockchain.pendingTransactions;
                }
        });

        if(!newLongestChain || (newPendingTransaction && !bitcoin.chainIsValid(newLongestChain))){
            res.json({note:'Current Chain has not been replaced', chain: bitcoin.chain});
        }else if(newLongestChain && bitcoin.chainIsValid((newLongestChain))){
            bitcoin.chain = newLongestChain;
            bitcoin.pendingTransactions = newPendingTransaction;
            res.json({note:'This chain has been replaced', chain: bitcoin.chain});
        }
    });
});

app.get('/block/:blockHash',(req,res)=>{
    const blockHash = req.params.blockHash;
    const block = bitcoin.getBlock(blockHash);

    res.json({
        block: block
    });
});

app.get('/transaction/:transactionId',(req,res)=>{
    const transactionId = req.params.transactionId;
    const transactionData = bitcoin.getTransaction(transactionId);

    res.json({
        transaction: transactionData.transaction,
        block : transactionData.block
    })
});

app.get('/address/:address',(req,res)=>{
    const address = req.params.address;
    const addressData = bitcoin.getAddressData(address);

    res.json({
        addressData: addressData
    });
});


app.get('/block-explorer',(req,res)=>{
    res.sendFile('./block-explorer/index.html',{root: __dirname});
});

app.listen(port, ()=>{
    console.log('Listening on port '+ port);
});


