import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

/** capsuled storage - systemd/launchd service file installation */
export const capsuled = {
    /** Auto detect platform and install capsuled. */
    async install() {
        const platform = process.platform
        if (platform === 'linux') {
            return this.linux()
        } else if (platform === 'darwin') {
            return this.darwin()
        } else if (platform === 'win32') {
            return this.windows()
        }
        throw new Error(`Unsupported platform: ${platform}`)
    },

    /** Install systemd service on Linux */
    async linux() {
        const home = process.env.HOME
        if (!home) throw new Error('HOME environment variable not set')

        const user = process.env.USER
        if (!user) throw new Error('USER environment variable not set')

        const execPath = process.execPath
        const configDir = join(home, '.config', 'systemd', 'user')

        // Ensure directory exists
        if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true })
        }

        const serviceContent = `[Unit]
Description=Capsuleer Daemon
After=network.target

[Service]
Type=simple
ExecStart=${execPath} daemon start
Restart=always
RestartSec=10
User=${user}

[Install]
WantedBy=multi-user.target
`

        const servicePath = join(configDir, 'capsuleer.service')
        writeFileSync(servicePath, serviceContent)

        // Reload systemd and enable service
        execSync('systemctl --user daemon-reload')
        execSync('systemctl --user enable capsuleer')

        console.log(`✓ Installed systemd service at ${servicePath}`)
        console.log('✓ Service enabled and will start on boot')
    },

    /** Install launchd plist on macOS */
    async darwin() {
        const home = process.env.HOME
        if (!home) throw new Error('HOME environment variable not set')

        const execPath = process.execPath
        const launchAgentsDir = join(home, 'Library', 'LaunchAgents')

        // Ensure directory exists
        if (!existsSync(launchAgentsDir)) {
            mkdirSync(launchAgentsDir, { recursive: true })
        }

        // Ensure logs directory exists
        const logsDir = join(home, '.capsuleer', 'logs')
        if (!existsSync(logsDir)) {
            mkdirSync(logsDir, { recursive: true })
        }

        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.capsuleer.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
    <string>daemon</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(logsDir, 'daemon.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(logsDir, 'daemon-error.log')}</string>
</dict>
</plist>
`

        const plistPath = join(launchAgentsDir, 'com.capsuleer.daemon.plist')
        writeFileSync(plistPath, plistContent)

        // Load the plist
        execSync(`launchctl load "${plistPath}"`)

        console.log(`✓ Installed launchd plist at ${plistPath}`)
        console.log('✓ Service loaded and will start on boot')
    },

    /** Install Windows service */
    async windows() {
        const execPath = process.execPath

        // Use SC command to create service (requires admin)
        try {
            const command = `sc create capsuleer binPath= "${execPath} daemon start" start= auto`
            execSync(command, { stdio: 'inherit' })
            console.log('✓ Windows service created')
            console.log('✓ Service set to auto-start')
        } catch (error: any) {
            throw new Error(`Failed to create Windows service. Administrator privileges required. Error: ${error.message}`)
        }
    }
}