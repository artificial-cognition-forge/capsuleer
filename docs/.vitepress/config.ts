import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "@hexlabs/capsuleer",
  description: "Runtime boundary system for controlled capabilities and sensory streams",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/concepts' },
      { text: 'Examples', link: '/examples/minimal' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/index' },
          { text: 'Concepts', link: '/concepts' }
        ]
      },
      {
        text: 'Core Abstractions',
        items: [
          { text: 'Capsule', link: '/capsule' },
          { text: 'Capabilities', link: '/capabilities' },
          { text: 'Middleware', link: '/middleware' },
          { text: 'Stimuli', link: '/stimuli' },
          { text: 'Lifecycle', link: '/lifecycle' },
          { text: 'Transports', link: '/transports' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Invariants', link: '/invariants' }
        ]
      },
      {
        text: 'Examples',
        items: [
          { text: 'Minimal Example', link: '/examples/minimal' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hexlabs/capsuleer' }
    ]
  }
})
