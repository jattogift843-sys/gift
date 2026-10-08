import { login } from '../src/services/auth.service.js';

async function test() {
  try {
    console.log('Testing login service...');
    const result = await login({ email: 'member@mt5smartmarket.com', password: 'Member@12345' });
    console.log('Login Result SUCCESS:', result);
  } catch (err) {
    console.error('Login ERROR trace:', err);
  }
}

test();
