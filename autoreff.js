import fetch from 'node-fetch';
import readline from 'readline';
import fs from 'fs';
import { logger } from './utils/logger.js';
import { banner } from './utils/banner.js';
import Mailjs from '@cemalgnlts/mailjs';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => {
    return new Promise((resolve) => rl.question(query, resolve));
};

// Kiểm tra file tồn tại
const ensureFileExists = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '', 'utf8');
        }
    } catch (error) {
        logger('Error creating file:', 'error', error.message);
        throw error;
    }
};

// Kiểm tra kết nối mạng
const checkNetwork = async () => {
    try {
        await fetch('https://www.google.com', { method: 'HEAD' });
        return true;
    } catch {
        return false;
    }
};

const registerUser = async (name, email, password, inviteCode) => {
    try {
        const registrationPayload = { name, username: email, password, inviteCode };
        const registerResponse = await fetch('https://api.openloop.so/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(registrationPayload),
        });

        if (!registerResponse.ok) {
            const errorData = await registerResponse.json();
            logger(`Registration failed! Status: ${registerResponse.status}, Message: ${errorData.message || 'Unknown error'}`, 'error');
            return false;
        }

        const registerData = await registerResponse.json();
        logger('Registration:', 'success', registerData.message);
        return true;
    } catch (error) {
        logger('Error during registration:', 'error', error.message);
        return false;
    }
};

const loginUser = async (email, password) => {
    try {
        const loginPayload = { username: email, password };
        const loginResponse = await fetch('https://api.openloop.so/users/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginPayload),
        });

        if (!loginResponse.ok) {
            const errorData = await loginResponse.json();
            throw new Error(`Login failed! Status: ${loginResponse.status}, Message: ${errorData.message || 'Unknown error'}`);
        }

        const loginData = await loginResponse.json();
        const accessToken = loginData.data.accessToken;
        logger('Login successful get token:', 'success', accessToken);

        try {
            fs.appendFileSync('token.txt', accessToken + '\n', 'utf8');
            logger('Access token saved to token.txt');
        } catch (error) {
            logger('Error saving token to file:', 'error', error.message);
            return null; // Nếu không lưu được token, coi như thất bại
        }

        return accessToken; // Trả về token nếu thành công
    } catch (error) {
        logger('Error during login:', 'error', error.message);
        return null; // Trả về null nếu thất bại
    }
};

const mailjs = new Mailjs();

async function manageMailAndRegister() {
    try {
        logger(banner, 'debug');

        if (!(await checkNetwork())) {
            throw new Error('No internet connection.');
        }

        ensureFileExists('token.txt');
        ensureFileExists('accounts.txt');

        const input = await askQuestion('How many accounts to create: ');
        const accountCount = parseInt(input, 10);
        if (isNaN(accountCount) || accountCount <= 0) throw new Error('Invalid account count.');

        const ref = await askQuestion('Use my referral code: (y/N): ');
        const referralCode = ref.toLowerCase() === 'n'
            ? await askQuestion('Enter referral code: ')
            : 'old5279ae3';

        if (!referralCode || referralCode.trim() === '') {
            throw new Error('Referral code cannot be empty.');
        }

        logger(`Register Using Referral code: ${referralCode}`, 'info');

        for (let i = 0; i < accountCount; i++) {
            try {
                const account = await mailjs.createOneAccount();
                if (!account || !account.data || !account.data.username) {
                    logger(`Failed to create email for account #${i + 1}`, 'error');
                    i--;
                    continue;
                }

                const email = account.data.username;
                const password = account.data.password;
                const name = email;

                logger(`Creating account #${i + 1} - Email: ${email}`, 'debug');

                const registrationSuccess = await registerUser(name, email, password, referralCode);
                if (registrationSuccess) {
                    const accessToken = await loginUser(email, password);
                    if (accessToken) { // Chỉ ghi vào accounts.txt nếu lấy được token
                        try {
                            fs.appendFileSync('accounts.txt', `Email: ${email}, Password: ${password}\n`, 'utf8');
                            logger(`Account #${i + 1} saved to accounts.txt`);
                        } catch (error) {
                            logger('Error saving account to file:', 'error', error.message);
                        }
                    } else {
                        logger(`Skipping account #${i + 1} because token retrieval failed`, 'warning');
                    }
                } else {
                    logger(`Skipping account #${i + 1} because registration failed`, 'warning');
                }

                await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 giây
            } catch (error) {
                logger(`Error with account #${i + 1}: ${error.message}`, 'error');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    } catch (error) {
        logger(`Error: ${error.message}`, 'error');
    } finally {
        rl.close();
    }
}

process.on('uncaughtException', (error) => {
    logger('Uncaught Exception:', 'error', error.message);
    rl.close();
    process.exit(1);
});

manageMailAndRegister();
