<template>
  <div class="app-layout">
    <AppSidebar />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import AppSidebar from './AppSidebar.vue';
</script>
