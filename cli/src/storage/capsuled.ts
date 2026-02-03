import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { getTrace } from '../capsuled/traceContext'

/** capsuled storage - systemd/launchd service file installation */
export const capsuled = {
    /** Check if service is already installed */
    async isInstalled(platform: "linux" | "darwin" | "win32"): Promise<boolean> {
        try {
            if (platform === 'linux') {
                const home = process.env.HOME
                if (!home) return false
                const servicePath = join(home, '.config', 'systemd', 'user', 'capsuleer.service')
                return existsSync(servicePath)
            } else if (platform === 'darwin') {
                const home = process.env.HOME
                if (!home) return false
                const plistPath = join(home, 'Library', 'LaunchAgents', 'com.capsuleer.daemon.plist')
                return existsSync(plistPath)
            } else if (platform === 'win32') {
                // Check if service exists on Windows
                try {
                    execSync('sc query capsuleer', { stdio: 'pipe' })
                    return true
                } catch {
                    return false
                }
            }
            return false
        } catch {
            return false
        }
    },

    /** Auto detect platform and install capsuled. */
    async install() {
        const platform = process.platform as "linux" | "darwin" | "win32"

        // Check if already installed before logging
        const alreadyInstalled = await capsuled.isInstalled(platform)
        if (alreadyInstalled) {
            return
        }

        const log = getTrace()

        log.push({
            type: "ctl.install.started",
            platform,
        })

        try {
            let result
            if (platform === 'linux') {
                result = await capsuled.linux()
            } else if (platform === 'darwin') {
                result = await capsuled.darwin()
            } else if (platform === 'win32') {
                result = await capsuled.windows()
            } else {
                throw new Error(`Unsupported platform: ${platform}`)
            }

            log.push({
                type: "ctl.install.completed",
                platform,
                path: result,
            })

            return result
        } catch (error: any) {
            log.push({
                type: "ctl.install.failed",
                platform,
                error: error.message,
            })
            throw error
        }
    },

    /** Auto detect platform and uninstall capsuled. */
    async uninstall() {
        const platform = process.platform as "linux" | "darwin" | "win32"
        const log = getTrace()

        log.push({
            type: "ctl.uninstall.started",
            platform,
        })

        try {
            let result
            if (platform === 'linux') {
                result = await capsuled.uninstallLinux()
            } else if (platform === 'darwin') {
                result = await capsuled.uninstallDarwin()
            } else if (platform === 'win32') {
                result = await capsuled.uninstallWindows()
            } else {
                throw new Error(`Unsupported platform: ${platform}`)
            }

            log.push({
                type: "ctl.uninstall.completed",
                platform,
                path: result,
            })

            return result
        } catch (error: any) {
            log.push({
                type: "ctl.uninstall.failed",
                platform,
                error: error.message,
            })
            throw error
        }
    },

    /** Install systemd service on Linux */
    async linux(): Promise<string> {
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

        return servicePath
    },

    /** Install launchd plist on macOS */
    async darwin(): Promise<string> {
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

        return plistPath
    },

    /** Install Windows service */
    async windows(): Promise<string> {
        const execPath = process.execPath

        // Use SC command to create service (requires admin)
        try {
            const command = `sc create capsuleer binPath= "${execPath} daemon start" start= auto`
            execSync(command, { stdio: 'inherit' })
            console.log('✓ Windows service created')
            console.log('✓ Service set to auto-start')
            // Return the service name for Windows
            return 'capsuleer'
        } catch (error: any) {
            throw new Error(`Failed to create Windows service. Administrator privileges required. Error: ${error.message}`)
        }
    },

    /** Uninstall systemd service on Linux */
    async uninstallLinux(): Promise<string> {
        const home = process.env.HOME
        if (!home) throw new Error('HOME environment variable not set')

        const servicePath = join(home, '.config', 'systemd', 'user', 'capsuleer.service')

        try {
            // Stop and disable service
            execSync('systemctl --user stop capsuleer', { stdio: 'pipe' })
            execSync('systemctl --user disable capsuleer', { stdio: 'pipe' })

            // Remove service file
            if (existsSync(servicePath)) {
                unlinkSync(servicePath)
                console.log(`✓ Removed systemd service from ${servicePath}`)
            }

            // Reload systemd
            execSync('systemctl --user daemon-reload')
            console.log('✓ Service uninstalled and daemon reloaded')

            return servicePath
        } catch (error: any) {
            throw new Error(`Failed to uninstall systemd service: ${error.message}`)
        }
    },

    /** Uninstall launchd plist on macOS */
    async uninstallDarwin(): Promise<string> {
        const home = process.env.HOME
        if (!home) throw new Error('HOME environment variable not set')

        const plistPath = join(home, 'Library', 'LaunchAgents', 'com.capsuleer.daemon.plist')

        try {
            // Unload the plist
            if (existsSync(plistPath)) {
                execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' })
            }

            // Remove plist file
            if (existsSync(plistPath)) {
                unlinkSync(plistPath)
                console.log(`✓ Removed launchd plist from ${plistPath}`)
            }

            console.log('✓ Service uninstalled')

            return plistPath
        } catch (error: any) {
            throw new Error(`Failed to uninstall launchd service: ${error.message}`)
        }
    },

    /** Uninstall Windows service */
    async uninstallWindows(): Promise<string> {
        try {
            // Stop the service first
            execSync('sc stop capsuleer', { stdio: 'pipe' })

            // Delete the service
            execSync('sc delete capsuleer', { stdio: 'inherit' })
            console.log('✓ Windows service deleted')
            // Return the service name for Windows
            return 'capsuleer'
        } catch (error: any) {
            throw new Error(`Failed to delete Windows service. Administrator privileges required. Error: ${error.message}`)
        }
    }
}