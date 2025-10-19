const Evernote = require('evernote');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const TOKEN_FILE = path.join(__dirname, '.evernote-token');

/**
 * Check if OAuth token exists
 * @returns {Promise<boolean>}
 */
async function hasToken() {
  try {
    await fs.access(TOKEN_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get stored OAuth token
 * @returns {Promise<string|null>}
 */
async function getToken() {
  try {
    const token = await fs.readFile(TOKEN_FILE, 'utf8');
    return token.trim();
  } catch {
    return null;
  }
}

/**
 * Save OAuth token to file
 * @param {string} token - OAuth access token
 */
async function saveToken(token) {
  await fs.writeFile(TOKEN_FILE, token, 'utf8');
  console.log('Access token saved successfully!');
}

/**
 * Perform OAuth authentication flow
 * @returns {Promise<string>} - Access token
 */
async function authenticate() {
  const consumerKey = process.env.EVERNOTE_CONSUMER_KEY;
  const consumerSecret = process.env.EVERNOTE_CONSUMER_SECRET;
  const endpoint = process.env.EVERNOTE_ENDPOINT || 'https://www.evernote.com';

  if (!consumerKey || !consumerSecret) {
    throw new Error('EVERNOTE_CONSUMER_KEY and EVERNOTE_CONSUMER_SECRET must be set in .env file');
  }

  // Determine sandbox mode
  const sandbox = endpoint.includes('sandbox');

  console.log('\n🔐 Starting OAuth authentication flow...\n');

  const client = new Evernote.Client({
    consumerKey: consumerKey,
    consumerSecret: consumerSecret,
    sandbox: sandbox
  });

  try {
    // Step 1: Get request token
    console.log('Getting request token...');
    const callbackUrl = 'http://localhost'; // Not used for desktop apps, but required

    const requestToken = await new Promise((resolve, reject) => {
      client.getRequestToken(callbackUrl, (error, oauthToken, oauthTokenSecret, results) => {
        if (error) {
          reject(error);
        } else {
          resolve({ oauthToken, oauthTokenSecret, results });
        }
      });
    });

    // Step 2: Get authorization URL
    const authorizeUrl = client.getAuthorizeUrl(requestToken.oauthToken);

    console.log('\n📱 Please visit this URL to authorize the application:');
    console.log('\n' + authorizeUrl + '\n');
    console.log('After authorizing, you will receive a verification code.');

    // Step 3: Ask user for verifier code
    const verifier = await askQuestion('Enter the verification code: ');

    if (!verifier || verifier.trim() === '') {
      throw new Error('Verification code is required');
    }

    // Step 4: Exchange verifier for access token
    console.log('\nExchanging verification code for access token...');

    const accessToken = await new Promise((resolve, reject) => {
      client.getAccessToken(
        requestToken.oauthToken,
        requestToken.oauthTokenSecret,
        verifier.trim(),
        (error, oauthAccessToken, oauthAccessTokenSecret, results) => {
          if (error) {
            reject(error);
          } else {
            resolve(oauthAccessToken);
          }
        }
      );
    });

    // Step 5: Save the access token
    await saveToken(accessToken);

    console.log('\n✅ Authentication successful!\n');

    return accessToken;

  } catch (error) {
    throw new Error(`OAuth authentication failed: ${error.message || JSON.stringify(error)}`);
  }
}

/**
 * Ask user a question and return their answer
 * @param {string} question
 * @returns {Promise<string>}
 */
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Remove stored OAuth token
 */
async function removeToken() {
  try {
    await fs.unlink(TOKEN_FILE);
    console.log('OAuth token removed successfully');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

module.exports = {
  hasToken,
  getToken,
  saveToken,
  authenticate,
  removeToken
};
