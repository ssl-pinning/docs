import { defineConfig, type DefaultTheme } from 'vitepress'

export default defineConfig({
  appearance: 'force-dark',
  cleanUrls: true,
  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],
  vite: {
    plugins: [
      {
        name: 'redirect-root-to-en-dev',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/') {
              res.statusCode = 302
              res.setHeader('Location', '/en/')
              res.end()
              return
            }
            next()
          })
        },
      },
    ],
  },
  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ssl-pinning/ssl-pinning' },
    ],
  },
  locales: {
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      title: 'SSL Pinning Docs',
      description: 'Documentation for the SSL Pinning platform: dynamic pinning server and client SDKs',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/architecture', activeMatch: '/en/guide/' },
          { text: 'Reference', link: '/en/reference/server-configuration', activeMatch: '/en/reference/' },
        ],
        sidebar: {
          '/en/guide/': {
            base: '/en/guide/',
            items: [
              {
                text: 'Guide',
                collapsed: false,
                items: [
                  { text: 'Architecture', link: 'architecture' },
                  { text: 'Self-hosting', link: 'self-hosting' },
                  { text: 'Android SDK', link: 'android-sdk' },
                  { text: 'iOS/macOS SDK', link: 'ios-macos-sdk' },
                  { text: 'Implementing your own connector', link: 'custom-connector' },
                ],
              },
            ],
          },
          '/en/reference/': {
            base: '/en/reference/',
            items: [
              {
                text: 'Reference',
                collapsed: false,
                items: [
                  { text: 'Server configuration', link: 'server-configuration' },
                  { text: 'HTTP API', link: 'http-api' },
                  { text: 'Signed registry format', link: 'registry-format' },
                ],
              },
            ],
          },
        },
      } satisfies DefaultTheme.Config,
    },
    ru: {
      label: 'Русский',
      lang: 'ru',
      link: '/ru/',
      title: 'Документация SSL Pinning',
      description: 'Документация платформы SSL Pinning: сервер динамического пиннинга и клиентские SDK',
      themeConfig: {
        outline: { label: 'Содержание страницы' },
        nav: [
          { text: 'Руководство', link: '/ru/guide/architecture', activeMatch: '/ru/guide/' },
          { text: 'Справочник', link: '/ru/reference/server-configuration', activeMatch: '/ru/reference/' },
        ],
        sidebar: {
          '/ru/guide/': {
            base: '/ru/guide/',
            items: [
              {
                text: 'Руководство',
                collapsed: false,
                items: [
                  { text: 'Архитектура', link: 'architecture' },
                  { text: 'Self-hosting', link: 'self-hosting' },
                  { text: 'Android SDK', link: 'android-sdk' },
                  { text: 'iOS/macOS SDK', link: 'ios-macos-sdk' },
                  { text: 'Реализация собственного коннектора', link: 'custom-connector' },
                ],
              },
            ],
          },
          '/ru/reference/': {
            base: '/ru/reference/',
            items: [
              {
                text: 'Справочник',
                collapsed: false,
                items: [
                  { text: 'Конфигурация сервера', link: 'server-configuration' },
                  { text: 'HTTP API', link: 'http-api' },
                  { text: 'Формат подписанного реестра', link: 'registry-format' },
                ],
              },
            ],
          },
        },
      } satisfies DefaultTheme.Config,
    },
    sr: {
      label: 'Srpski',
      lang: 'sr-Latn',
      link: '/sr/',
      title: 'SSL Pinning Dokumentacija',
      description: 'Dokumentacija platforme SSL Pinning: server za dinamički pinning i klijentski SDK-ovi',
      themeConfig: {
        outline: { label: 'Na ovoj stranici' },
        nav: [
          { text: 'Vodič', link: '/sr/guide/architecture', activeMatch: '/sr/guide/' },
          { text: 'Referenca', link: '/sr/reference/server-configuration', activeMatch: '/sr/reference/' },
        ],
        sidebar: {
          '/sr/guide/': {
            base: '/sr/guide/',
            items: [
              {
                text: 'Vodič',
                collapsed: false,
                items: [
                  { text: 'Arhitektura', link: 'architecture' },
                  { text: 'Self-hosting', link: 'self-hosting' },
                  { text: 'Android SDK', link: 'android-sdk' },
                  { text: 'iOS/macOS SDK', link: 'ios-macos-sdk' },
                  { text: 'Implementacija sopstvenog konektora', link: 'custom-connector' },
                ],
              },
            ],
          },
          '/sr/reference/': {
            base: '/sr/reference/',
            items: [
              {
                text: 'Referenca',
                collapsed: false,
                items: [
                  { text: 'Konfiguracija servera', link: 'server-configuration' },
                  { text: 'HTTP API', link: 'http-api' },
                  { text: 'Format potpisanog registra', link: 'registry-format' },
                ],
              },
            ],
          },
        },
      } satisfies DefaultTheme.Config,
    },
  },
})
