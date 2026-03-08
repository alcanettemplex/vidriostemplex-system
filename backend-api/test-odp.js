import axios from 'axios';
async function test() {
    try {
        const res1 = await axios.post('http://localhost:3001/api/auth/login', { username: 'admin', password: 'password123' });
        const token = res1.data.token;
        const res2 = await axios.get('http://localhost:3001/api/odp', { headers: { Authorization: `Bearer ${token}` } });
        console.log("SUCCESS length", res2.data.length);
        console.log(res2.data[0]);
    } catch (e) {
        if (e.response) {
            console.error(e.response.data);
        } else {
            console.error(e.message);
        }
    }
}
test();
