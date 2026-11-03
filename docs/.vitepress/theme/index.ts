import DefaultTheme from 'vitepress/theme'
import { Button, Hero, Terminal } from '@ssl-pinning/components'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import BgLayer from './components/BgLayer.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(BgLayer),
    })
  },
  enhanceApp({ app }) {
    app.component('Button', Button)
    app.component('Hero', Hero)
    app.component('Terminal', Terminal)
  },
} satisfies Theme
