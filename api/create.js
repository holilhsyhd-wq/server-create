const fetch = require('node-fetch');

// 1. AMBIL KONFIGURASI BARU DARI ENVIRONMENT VARIABLES
const config = {
    // Config untuk server Private
    private: {
        domain: process.env.PTERO_DOMAIN_PRIVATE,
        apiKey: process.env.PTERO_API_KEY_PRIVATE,
    },
    // Config untuk server Public
    public: {
        domain: process.env.PTERO_DOMAIN_PUBLIC,
        apiKey: process.env.PTERO_API_KEY_PUBLIC,
    },
    // Pengaturan yang dipakai bersama
    shared: {
        eggId: parseInt(process.env.PTERO_EGG_ID),
        locationId: parseInt(process.env.PTERO_LOCATION_ID),
        disk: parseInt(process.env.PTERO_DISK) || 5120,
        cpu: parseInt(process.env.PTERO_CPU) || 100
    },
    secretKey: process.env.SECRET_KEY 
};

// 2. FUNGSI INTI (USER)
async function createUser(serverName, pteroConfig) {
    const url = `${pteroConfig.domain}/api/application/users`;
    
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
                'Authorization': `Bearer ${pteroConfig.apiKey}`,
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

// 2. FUNGSI INTI (SERVER)
async function createServer(telegramUserId, serverName, memory, pterodactylUserId, pteroConfig, sharedConfig) {
    const url = `${pteroConfig.domain}/api/application/servers`;

    const serverData = {
        name: serverName,
        user: pterodactylUserId,
        egg: sharedConfig.eggId,
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",

        // STARTUP BARU (satu baris, aman untuk JSON + JS)
        startup: `if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z \${NODE_PACKAGES} ]]; then /usr/local/bin/npm install \${NODE_PACKAGES}; fi; if [[ ! -z \${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall \${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; if [[ ! -z \${CUSTOM_ENVIRONMENT_VARIABLES} ]]; then vars=$(echo \${CUSTOM_ENVIRONMENT_VARIABLES} | tr ";" "\\n"); for line in $vars; do export $line; done; fi; /usr/local/bin/\${CMD_RUN};`,

        environment: {
            USER_ID: telegramUserId || "web_created_user",
            CMD_RUN: "node index.js",

            // default env tambahan biar langsung kepakai
            AUTO_UPDATE: "1",
            NODE_PACKAGES: "",
            UNNODE_PACKAGES: "",
            CUSTOM_ENVIRONMENT_VARIABLES: ""
        },
        limits: {
            memory: parseInt(memory),
            swap: 0,
            disk: sharedConfig.disk,
            io: 500,
            cpu: sharedConfig.cpu,
        },
        feature_limits: {
            databases: 1,
            allocations: 1,
            backups: 1
        },
        deploy: {
            locations: [sharedConfig.locationId],
            dedicated_ip: false,
            port_range: []
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pteroConfig.apiKey}`,
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


// 3. HANDLER UTAMA
export default async function handler(req, res) {
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { serverName, ram, secretKey, serverType } = req.body;

        // Validasi input
        if (!serverName || !ram || !secretKey || !serverType) {
            return res.status(400).json({ error: 'Semua field (termasuk Tipe Server) harus diisi.' });
        }
        
        if (secretKey !== config.secretKey) {
            return res.status(401).json({ error: 'Secret Key salah.' });
        }

        // Pilih config private/public
        let pteroConfig;
        const sharedConfig = config.shared;

        if (serverType === 'private') {
            pteroConfig = config.private;
        } else if (serverType === 'public') {
            pteroConfig = config.public;
        } else {
            return res.status(400).json({ error: 'Tipe server tidak valid.' });
        }

        if (!pteroConfig.domain || !pteroConfig.apiKey) {
            return res.status(500).json({ error: `Konfigurasi untuk server '${serverType}' belum diatur oleh admin.` });
        }

        // 1. Buat user
        const userResult = await createUser(serverName, pteroConfig);
        if (!userResult.success) {
            return res.status(500).json({ error: `Gagal membuat akun: ${userResult.error}` });
        }

        const newUser = userResult.user;
        const newUserPassword = userResult.password;

        // 2. Buat server
        const serverResult = await createServer(null, serverName, ram, newUser.id, pteroConfig, sharedConfig);
        if (!serverResult.success) {
            return res.status(500).json({ error: `Gagal membuat server: ${serverResult.error}` });
        }

        // 3. Response
        res.status(200).json({
            success: true,
            panelURL: pteroConfig.domain,
            user: newUser,
            password: newUserPassword,
            server: serverResult.data
        });

    } catch (error) {
        console.error("Internal Server Error:", error);
        res.status(500).json({ error: 'Terjadi kesalahan internal pada server.' });
    }
}
