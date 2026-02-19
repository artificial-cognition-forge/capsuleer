import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Capsuleer",
  description: "Controlled remote execution for AI agents",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      // no nav items
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: "Overview", link: '/' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Why', link: '/guide/why' },
        ]
      },
      {
        text: 'Daemon',
        items: [
          { text: 'Overview', link: '/daemon/overview' },
          { text: 'Lifecycle', link: '/daemon/lifecycle' },
          { text: 'Configuration', link: '/daemon/configuration' },
          { text: "CLI", link: '/daemon/cli-reference.md' }
        ]
      },
      {
        text: 'Capsules',
        items: [
          { text: 'Overview', link: '/capsule/overview' },
          { text: 'Blueprint Anatomy', link: '/capsule/blueprint-anatomy' },
          { text: 'Capability APIs', link: '/capsule/capability-apis' },
          { text: 'Mediation Policies', link: '/capsule/mediation-policies' },
          { text: 'Creating Capsules', link: '/capsule/creating-capsules' }
        ]
      },
      {
        text: 'SDK Guide',
        items: [
          { text: 'Overview', link: '/sdk/overview' },
          { text: 'Installation', link: '/sdk/installation' },
          { text: 'Connecting', link: '/sdk/connecting' },
          { text: 'Spawning Processes', link: '/sdk/spawning-processes' },
          { text: 'Stream Handling', link: '/sdk/stream-handling' },
          { text: 'Session Lifecycle', link: '/sdk/session-lifecycle' }
        ]
      },
      {
        text: 'API Reference',
        items: [
          { text: 'CLI Reference', link: '/api/cli' },
          { text: 'SDK Types', link: '/api/sdk-types' },
          { text: 'RPC Contract', link: '/api/rpc-contract' },
          { text: 'Blueprint Spec', link: '/api/blueprint-spec' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/anthropics/capsuleer' }
    ]
  }
})
