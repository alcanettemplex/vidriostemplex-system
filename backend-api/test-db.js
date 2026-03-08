const { Client } = require('pg');
const tryConnect = async (region) => {
    try {
        const client = new Client({ connectionString: `postgresql://postgres.mvcmofhbjvxjnxefylsa:YYOxoKd21yRl0Auk@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true` });
        await client.connect();
        console.log('Connected to ' + region);
        process.exit(0);
    } catch (e) {
        if (e.message !== "Tenant or user not found") {
            console.log('Failed ' + region, e.message);
        }
    }
};

const regions = [
    "ap-northeast-1", "ap-northeast-2", "ap-south-1", "ap-southeast-1", "ap-southeast-2",
    "ca-central-1", "eu-central-1", "eu-central-2", "eu-north-1", "eu-west-1", "eu-west-2",
    "eu-west-3", "sa-east-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2"
];

(async () => {
    for (const r of regions) {
        await tryConnect(r);
    }
    console.log("None connected");
    process.exit(1);
})();
