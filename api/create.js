async function createServer(telegramUserId, serverName, memory, pterodactylUserId, pteroConfig, sharedConfig) {
    const url = `${pteroConfig.domain}/api/application/servers`;

    const serverData = {
        name: serverName,
        user: pterodactylUserId,
        egg: sharedConfig.eggId, // <-- Menggunakan shared config
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: "if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == \"1\" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi;  if [[ ! -z ${CUSTOM_ENVIRONMENT_VARIABLES} ]]; then      vars=$(echo ${CUSTOM_ENVIRONMENT_VARIABLES} | tr \";\" \"\n\");      for line in $vars;     do export $line;     done fi;  /usr/local/bin/${CMD_RUN};",
        environment: {
            USER_ID: telegramUserId || "web_created_user", 
            CMD_RUN: "node index.js"
        },
        limits: {
            memory: parseInt(memory),
            swap: 0,
            disk: sharedConfig.disk, // <-- Menggunakan shared config
            io: 500,
            cpu: sharedConfig.cpu, // <-- Menggunakan shared config
        },
        feature_limits: {
            databases: 1,
            allocations: 1,
            backups: 1
        },
        deploy: {
            locations: [sharedConfig.locationId], // <-- Menggunakan shared config
            dedicated_ip: false,
            port_range: []
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pteroConfig.apiKey}`, // <-- Menggunakan apiKey dinamis
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
