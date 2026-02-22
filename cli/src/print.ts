import chalk from "chalk"

export const print = {
    header: () => {
        console.log("")
        console.log(chalk.bold.cyan("Capsuleer") + " " + chalk.dim("v0.1.0"))
        console.log("")
    },

    success: (message: string) => {
        console.log(chalk.green("✓"), chalk.dim(message))
    },

    info: (message: string) => {
        console.log(chalk.cyan("→"), chalk.dim(message))
    },

    error: (message: string) => {
        console.log(chalk.red("✗"), message)
    },

    dim: (message: string) => {
        console.log(chalk.dim(message))
    },

    path: (message: string) => {
        console.log(chalk.dim("  " + message))
    },

    blank: () => {
        console.log("")
    },

    module: (name: string, description: string) => {
        console.log(chalk.bold.white(name))
        console.log(chalk.dim(description))
    },

    item: (label: string, value: string) => {
        console.log(chalk.cyan(label.padEnd(15)) + " " + chalk.dim(value))
    },
}
