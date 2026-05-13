
async function ping() {
    try {
        const res = await fetch('http://localhost:3001/api/dashboard-stats');
        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Data:', data);
    } catch (e) {
        console.log('Server unreachable:', e.message);
    }
}
ping();
