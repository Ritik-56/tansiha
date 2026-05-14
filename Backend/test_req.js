const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/register/patient', {
      fullName: 'Test User',
      email: 'test@test.com',
      phone: '1234567890',
      password: 'password123'
    });
    console.log(res.data);
  } catch (err) {
    console.error("Signup error:", err.response ? err.response.data : err.message);
  }
}

test();
