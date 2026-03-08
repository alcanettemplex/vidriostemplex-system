async function test() {
    try {
        const res1 = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: '123456' })
        });
        const data1 = await res1.json();
        const token = data1.token;

        const res2 = await fetch('http://localhost:3001/api/odp', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res2.status !== 200) {
            console.log(await res2.text());
        } else {
            const data2 = await res2.json();
            console.log("Status:", res2.status);
            console.log("Length:", Array.isArray(data2) ? data2.length : "Not an array");
            console.log("First element:", data2[0]);
        }
    } catch (e) { console.error(e); }
}
test();
