import Evernote from 'evernote';
import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';
import { app, BrowserWindow } from 'electron';
import { EVERNOTE_CONSUMER_KEY, EVERNOTE_CONSUMER_SECRET, EVERNOTE_ENDPOINT } from '../config/runtime-config.js';

const TOKEN_FILE = path.join(app.getPath('userData'), '.evernote-token');

/**
 * Check if OAuth token exists
 */
export async function hasToken(): Promise<boolean> {
  try {
    await fs.access(TOKEN_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get stored OAuth token
 */
export async function getToken(): Promise<string | null> {
  try {
    const token = await fs.readFile(TOKEN_FILE, 'utf8');
    return token.trim();
  } catch {
    return null;
  }
}

/**
 * Save OAuth token to file
 * @param token - OAuth access token
 */
export async function saveToken(token: string): Promise<void> {
  await fs.writeFile(TOKEN_FILE, token, 'utf8');
  console.log('Access token saved successfully!');
}

/**
 * Ask user a question and return their answer
 * @param question - Question to ask the user
 */
function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Perform OAuth authentication flow
 * @returns Access token
 */
export async function authenticate(): Promise<string> {
  const consumerKey = EVERNOTE_CONSUMER_KEY;
  const consumerSecret = EVERNOTE_CONSUMER_SECRET;
  const endpoint = EVERNOTE_ENDPOINT;

  if (!consumerKey || !consumerSecret) {
    throw new Error('EVERNOTE_CONSUMER_KEY and EVERNOTE_CONSUMER_SECRET must be configured');
  }

  // Determine sandbox mode
  const sandbox = endpoint.includes('sandbox');

  console.log('\n🔐 Starting OAuth authentication flow...\n');

  const client = new Evernote.Client({
    consumerKey: consumerKey,
    consumerSecret: consumerSecret,
    sandbox: sandbox,
  });

  try {
    // Step 1: Get request token
    console.log('Getting request token...');
    const callbackUrl = 'http://localhost'; // Not used for desktop apps, but required

    const requestToken = await new Promise<{
      oauthToken: string;
      oauthTokenSecret: string;
      results: unknown;
    }>((resolve, reject) => {
      client.getRequestToken(callbackUrl, (error: Error | null, oauthToken: string, oauthTokenSecret: string, results: unknown) => {
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

    const accessToken = await new Promise<string>((resolve, reject) => {
      client.getAccessToken(
        requestToken.oauthToken,
        requestToken.oauthTokenSecret,
        verifier.trim(),
        (error: Error | null, oauthAccessToken: string, _oauthAccessTokenSecret: string, _results: unknown) => {
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
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`OAuth authentication failed: ${errorMessage}`);
  }
}

/**
 * Perform OAuth authentication flow using a BrowserWindow
 * This is the preferred method for distributed Electron apps
 * @returns Access token
 */
export async function authenticateWithWindow(): Promise<string> {
  const consumerKey = EVERNOTE_CONSUMER_KEY;
  const consumerSecret = EVERNOTE_CONSUMER_SECRET;
  const endpoint = EVERNOTE_ENDPOINT;

  if (!consumerKey || !consumerSecret) {
    throw new Error('EVERNOTE_CONSUMER_KEY and EVERNOTE_CONSUMER_SECRET must be configured');
  }

  // Determine sandbox mode
  const sandbox = endpoint.includes('sandbox');

  // Use a localhost callback URL that we'll intercept
  const callbackUrl = 'http://localhost:53546/callback';

  const client = new Evernote.Client({
    consumerKey: consumerKey,
    consumerSecret: consumerSecret,
    sandbox: sandbox,
  });

  try {
    // Step 1: Get request token
    console.log('Getting request token...');

    const requestToken = await new Promise<{
      oauthToken: string;
      oauthTokenSecret: string;
      results: unknown;
    }>((resolve, reject) => {
      client.getRequestToken(callbackUrl, (error: Error | null, oauthToken: string, oauthTokenSecret: string, results: unknown) => {
        if (error) {
          reject(error);
        } else {
          resolve({ oauthToken, oauthTokenSecret, results });
        }
      });
    });

    // Step 2: Get authorization URL
    const authorizeUrl = client.getAuthorizeUrl(requestToken.oauthToken);

    console.log('Opening Evernote authorization page...');

    // Step 3: Open BrowserWindow with OAuth page and intercept callback
    const verifier = await new Promise<string>((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        title: 'Connect to Evernote'
      });

      // Set up filter to intercept callback URL
      const filter = { urls: [callbackUrl + '*'] };

      const { session } = authWindow.webContents;

      // Intercept the callback before it loads
      session.webRequest.onBeforeRequest(filter, (details, callback) => {
        const url = new URL(details.url);
        const oauthVerifier = url.searchParams.get('oauth_verifier');

        if (oauthVerifier) {
          // Close the window immediately
          authWindow.close();
          resolve(oauthVerifier);
        } else {
          reject(new Error('No verification code received from Evernote'));
        }

        // Cancel the request since we don't have a server listening
        callback({ cancel: true });
      });

      // Handle window close without completing auth
      authWindow.on('closed', () => {
        reject(new Error('Authentication window was closed'));
      });

      // Load the OAuth authorization URL
      authWindow.loadURL(authorizeUrl);
    });

    if (!verifier || verifier.trim() === '') {
      throw new Error('Verification code is required');
    }

    // Step 4: Exchange verifier for access token
    console.log('Exchanging verification code for access token...');

    const accessToken = await new Promise<string>((resolve, reject) => {
      client.getAccessToken(
        requestToken.oauthToken,
        requestToken.oauthTokenSecret,
        verifier.trim(),
        (error: Error | null, oauthAccessToken: string, _oauthAccessTokenSecret: string, _results: unknown) => {
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

    console.log('✅ Authentication successful!');

    return accessToken;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    throw new Error(`OAuth authentication failed: ${errorMessage}`);
  }
}

/**
 * Remove stored OAuth token
 */
export async function removeToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
    console.log('OAuth token removed successfully');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      throw error;
    }
  }
}
