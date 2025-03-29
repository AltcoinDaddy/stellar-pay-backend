const express = require('express');
const StellarSDK = require('stellar-sdk');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const HORIZON_URL = 'https://horizon.stellar.org';
const NETWORK_PASSPHRASE = StellarSDK.Networks.PUBLIC;

// home
app.get('/', (req, res) => {
  res.json({
    success: true,
  });
});

app.get('/api', (req, res) => {
  res.json({ message: 'Hello from Express on Vercel!' });
});

// CREATE PAYMENT transaction (returns signed XDR)
app.post('/api/create-payment', async (req, res) => {
  try {
    const { 
      sourceSecret, 
      destinationAddress, 
      amount, 
      assetCode = 'XLM', 
      assetIssuer = null 
    } = req.body;
    
    if (!sourceSecret || !destinationAddress || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters' 
      });
    }

    const sourceKeypair = StellarSDK.Keypair.fromSecret(sourceSecret);
    const server = new StellarSDK.Server(HORIZON_URL);
    
    const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
    
    // Determine which asset to send
    let asset;
    if (assetCode === 'XLM') {
      asset = StellarSDK.Asset.native();
    } else if (assetIssuer) {
      asset = new StellarSDK.Asset(assetCode, assetIssuer);
    } else {
      return res.status(400).json({
        success: false, 
        error: 'Asset issuer is required for non-native assets'
      });
    }
    
    // Build and sign the transaction
    const transaction = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSDK.Operation.payment({
        destination: destinationAddress,
        asset: asset,
        amount: amount
      }))
      .setTimeout(30)
      .build();
    
    transaction.sign(sourceKeypair);
    
    // Return the signed transaction as XDR
    const signedXDR = transaction.toXDR();
    
    res.json({
      success: true,
      signedXDR
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// SUBMIT transaction XDR
app.post('/api/submit-transaction', async (req, res) => {
  try {
    const { signedXDR } = req.body;
    
    if (!signedXDR) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing signed transaction XDR' 
      });
    }
    
    const server = new StellarSDK.Server(HORIZON_URL);
    const transaction = StellarSDK.TransactionBuilder.fromXDR(
      signedXDR, 
      NETWORK_PASSPHRASE
    );
    
    const result = await server.submitTransaction(transaction);
    
    res.json({
      success: true,
      transactionId: result.id,
      ledger: result.ledger,
      hash: result.hash
    });
  } catch (error) {
    console.error('Error submitting transaction:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// CREATE KEYPAIR
app.get('/api/create-keypair', (req, res) => {
  try {
    const keypair = StellarSDK.Keypair.random();
    
    res.json({
      success: true,
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret()
    });
  } catch (error) {
    console.error('Error creating keypair:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ADD TRUSTLINE (returns signed XDR)
app.post('/api/create-trustline', async (req, res) => {
  try {
    const { 
      secretKey, 
      assetCode, 
      assetIssuer, 
      limit = '1000000000' 
    } = req.body;
    
    if (!secretKey || !assetCode || !assetIssuer) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters' 
      });
    }
    
    const keypair = StellarSDK.Keypair.fromSecret(secretKey);
    const server = new StellarSDK.Server(HORIZON_URL);
    
    const account = await server.loadAccount(keypair.publicKey());
    const asset = new StellarSDK.Asset(assetCode, assetIssuer);
    
    const transaction = new StellarSDK.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE
    })
      .addOperation(StellarSDK.Operation.changeTrust({
        asset: asset,
        limit: limit
      }))
      .setTimeout(30)
      .build();
    
    transaction.sign(keypair);
    
    const signedXDR = transaction.toXDR();
    
    res.json({
      success: true,
      signedXDR
    });
  } catch (error) {
    console.error('Error creating trustline:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`Stellar service running on port ${PORT}`);
});

module.exports = app;