<template>
  <div v-if="frontmatter.layout !== 'home'" class="doc-bg-layer">
    <div class="doc-bg-layer__blob doc-bg-layer__blob--blue" />
    <div class="doc-bg-layer__blob doc-bg-layer__blob--cyan" />
  </div>
</template>

<script setup lang="ts">
import { useData } from 'vitepress'

const { frontmatter } = useData()
</script>

<style scoped>
.doc-bg-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 70;
}

.doc-bg-layer__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0;
}

.doc-bg-layer__blob--blue {
  width: 500px;
  height: 500px;
  top: 20%;
  left: 10%;
  background: radial-gradient(circle, #3b82f6, transparent 100%);
  animation: blob-breathe-blue 2s ease-in-out infinite, blob-drift-blue 5s ease-in-out infinite;
}

.doc-bg-layer__blob--cyan {
  width: 600px;
  height: 600px;
  top: 50%;
  right: 5%;
  background: radial-gradient(circle, #06b6d4, transparent 100%);
  animation: blob-breathe-cyan 3s ease-in-out infinite, blob-drift-cyan 6s ease-in-out infinite;
}

@keyframes blob-breathe-blue {
  0%, 100% { opacity: .4; }
  60%      { opacity: .5; }
}

@keyframes blob-breathe-cyan {
  0%, 100% { opacity: .3; }
  60%      { opacity: .5; }
}

@keyframes blob-drift-blue {
  0%   { transform: translate(0, 0); }
  25%  { transform: translate(40px, -80px); }
  50%  { transform: translate(80px, 130px); }
  75%  { transform: translate(-50px, 70px); }
  100% { transform: translate(0, 0); }
}

@keyframes blob-drift-cyan {
  0%   { transform: translate(0, 0); }
  25%  { transform: translate(-50px, 50px); }
  50%  { transform: translate(60px, -40px); }
  75%  { transform: translate(-80px, -30px); }
  100% { transform: translate(0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .doc-bg-layer__blob { animation: none !important; }
}
</style>
