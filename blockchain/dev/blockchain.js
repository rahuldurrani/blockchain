const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
const uuid = require('uuid/v1');

function Blockchain(){
    this.chain = [];
    this.pendingTransactions = [];
    this.currentNodeUrl = currentNodeUrl;
    this.networkNode = [];
    this.createNewBlock(100,'0','0');
}

Blockchain.prototype.createNewBlock = function (nonce, previousBlockHash, hash) {
    const newBlock = {
      index: this.chain.length+1,
      timestamp : Date.now(),
      transactions : this.pendingTransactions,
      nonce:nonce,
      previousBlockHash: previousBlockHash,
      hash: hash
    };

    this.pendingTransactions = [];
    this.chain.push(newBlock);
    return newBlock;
};

Blockchain.prototype.getLastBlock = function ()  {
    return this.chain[this.chain.length-1];
};

Blockchain.prototype.createNewTransaction = function(amount, sender, recipient) {
    const newTransaction = {
      amount,
      sender,
      recipient,
        "transactionid":uuid().split('-').join('')
    };

    return newTransaction;

};

Blockchain.prototype.addTransactionToPendingTransaction = function (transsactionObj){
    this.pendingTransactions.push(transsactionObj);
    return this.getLastBlock()['index'] + 1;
};

Blockchain.prototype.hashBlock = function(previousBlockHash, currentBlockData, nonce) {

    const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
    return sha256(dataAsString);
};

Blockchain.prototype.proofOfWork = function(previousBlockHash, currentBlockData){
    let nonce = 0;
    let hash = this.hashBlock(previousBlockHash,currentBlockData,nonce);
    while (hash.toString().substring(0,4) !== '0000'){
        nonce ++;
        hash = this.hashBlock(previousBlockHash,currentBlockData, nonce);
    }
    return nonce;
};

Blockchain.prototype.chainIsValid = function(blockchain) {
    let validChain = true;
    for(let i =1 ; i< blockchain.length; i++){
        const currentblock = blockchain[i];
        const previousBlock = blockchain[i-1];

        const blockhash = this.hashBlock(previousBlock['hash'],{transactions:currentblock['transactions'],index:currentblock['index']},currentblock['nonce']);
        if(blockhash.toString().substr(0,4)!== '0000'){
            validChain = false;
        }
        if(currentblock['previousBlockHash'] !== previousBlock['hash']){
            validChain = false;
        }
    }
    const genesisBlock = blockchain[0];
    const correctNonce = genesisBlock['nonce'] === 100;
    const correctPrevoiusBlockHash = genesisBlock['previousBlockHash'] === '0';
    const correctHash = genesisBlock['hash'] === '0';
    const correctTransactions = genesisBlock['transactions'].length === 0;
    if(!correctNonce || !correctHash || !correctPrevoiusBlockHash || !correctTransactions) validChain = false;
    return validChain;
};

Blockchain.prototype.getBlock = function(blockHash){
    let correctBlock = null;
    this.chain.forEach(block => {
        if(block.hash === blockHash){
            correctBlock = block;
        }
    });

    return correctBlock;
};

Blockchain.prototype.getTransaction = function(transactionId){
    let correctTransaction = null;
    let correctBlock = null;
    this.chain.forEach(block => {
        block.transactions.forEach(transaction =>{
            if(transaction.transactionid === transactionId) {
                correctTransaction = transaction;
                correctBlock = block;
            }
        });
    });

    return {transaction:correctTransaction, block: correctBlock};
};

Blockchain.prototype.getAddressData = function(address){
    const addressTransaction = [];
    this.chain.forEach(block => {
        block.transactions.forEach(transaction=>{
            if(transaction.sender === address || transaction.recipient === address){
                addressTransaction.push(transaction);
            };
        });
    });

    let balance = 0;
    addressTransaction.forEach(transaction => {
        if(transaction.recipient === address) balance += transaction.amount;
        else if (transaction.sender === address) balance -= transaction.amount;
    });

    return {
        assressTransaction : addressTransaction,
        addressBalance: balance
    };
};
module.exports =  Blockchain;