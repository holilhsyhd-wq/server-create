const fetch = require('node-fetch');

// 1. AMBIL KONFIGURASI DARI ENVIRONMENT VARIABLES
// Ini BUKAN lagi file config.js. Anda harus mengatur ini di Vercel.
const config = {
    pterodactyl: {
        domain: process.env.PTERO_DOMAIN,
        apiKey: process.env.PTERO_API_KEY,
        eggId: parseInt(process.env.PTERO_EGG_ID),
        locationId: parseInt(process.env.PTERO_LOCATION_ID),
        disk: parseInt(process.env.PTERO_DISK) || 5120, // Default 5GB
        cpu: parseInt(process.env.PTERO_CPU) || 100     // Default 100%
    },
    // Ini adalah password untuk melindungi website Anda
    secretKey: process.env.SECRET_KEY 
};

// 2. SALIN FUNGSI INTI ANDA DARI bot.js
async function createUser(serverName) {
    const pterodactyl = config.pterodactyl;
    const url = `${pterodactyl.domain}/api/application/users`;
    
    const randomString = Math.random().toString(36).substring(7);
    const email = `${serverName.toLowerCase().replace(/\s+/g, '')}@${randomString}.com`;
    const username = `${serverName.toLowerCase().replace(/\s+/g, '')}_${randomString}`;
    const password = Math.random().toString(36).slice(-10);
    
    const userData = {
        email: email,
        username: username,
        first_name: serverName,
        last_name: "User",
        password: password,
        root_admin: false
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pterodactyl.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        const data = await response.json();
        if (response.status === 201) {
            return { success: true, user: data.attributes, password: password };
        } else {
            console.error("Gagal membuat user:", JSON.stringify(data.errors, null, 2));
            return { success: false, error: data.errors ? data.errors[0].detail : 'Gagal membuat pengguna baru.' };
        }
    } catch (error) {
        console.error("Error saat fetch API user:", error);
        return { success: false, error: 'Gagal terhubung ke API Pterodactyl untuk membuat pengguna.' };
    }
}

async function createServer(telegramUserId, serverName, memory, pterodactylUserId) {
    const pterodactyl = config.pterodactyl;
    const url = `${pterodactyl.domain}/api/application/servers`;

    const serverData = {
        name: serverName,
        user: pterodactylUserId,
        egg: pterodactyl.eggId,
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: "if [[ -d .git ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ -f /home/container/package.json ]]; then /usr/local/bin/npm install; fi; {{CMD_RUN}}",
        environment: {
            // Kita tidak punya msg.from.id, jadi kita bisa isi string statis
            USER_ID: telegramUserId || "web_created_user", 
            CMD_RUN: "node index.js"
        },
        limits: {
            memory: parseInt(memory),
            swap: 0,
            disk: pterodactyl.disk,
            io: 500,
            cpu: pterodactyl.cpu,
        },
        feature_limits: {
            databases: 1,
            allocations: 1,
            backups: 1
        },
        deploy: {
            locations: [pterodactyl.locationId],
            dedicated_ip: false,
            port_range: []
        }
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pterodactyl.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(serverData)
        });
        const data = await response.json();
        if (response.status === 201) {
            return { success: true, data: data.attributes };
        } else {
            console.error("Error Pterodactyl API Server:", JSON.stringify(data.errors, null, 2));
            return { success: false, error: data.errors ? data.errors[0].detail : 'Gagal membuat server.' };
        }
    } catch (error) {
        console.error("Error saat fetch API Server:", error);
        return { success: false, error: 'Gagal terhubung ke Pterodactyl API untuk membuat server.' };
    }
}


// 3. INI ADALAH FUNGSI UTAMA (HANDLER) UNTUK VERCEl
export default async function handler(req, res) {
    
    // Hanya izinkan metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { serverName, ram, secretKey } = req.body;

        // Validasi input dasar
        if (!serverName || !ram || !secretKey) {
            return res.status(400).json({ error: 'Semua field harus diisi.' });
        }
        
        // Proteksi password untuk website Anda
        if (secretKey !== config.secretKey) {
            return res.status(401).json({ error: 'Secret Key salah.' });
        }

        // Langkah 1: Buat pengguna
        const userResult = await createUser(serverName);
        if (!userResult.success) {
            // Kirim error spesifik dari Pterodactyl
            return res.status(500).json({ error: `Gagal membuat akun: ${userResult.error}` });
        }

        const newUser = userResult.user;
        const newUserPassword = userResult.password;

        // Langkah 2: Buat server
        const serverResult = await createServer(null, serverName, ram, newUser.id);
        if (!serverResult.success) {
            // Kirim error spesifik dari Pterodactyl
            return res.status(500).json({ error: `Gagal membuat server: ${serverResult.error}` });
        }

        // Langkah 3: Kirim respon sukses kembali ke browser
        res.status(200).json({
            success: true,
            panelURL: config.pterodactyl.domain,
            user: newUser,
            password: newUserPassword,
            server: serverResult.data
        });

    } catch (error) {
        console.error("Internal Server Error:", error);
        res.status(500).json({ error: 'Terjadi kesalahan internal pada server.' });
    }
}
