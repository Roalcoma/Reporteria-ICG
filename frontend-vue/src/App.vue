<template>
  <RouterView />
  <AppToasts />
  <AppModal />
</template>

<script setup>
import AppToasts from '@/components/ui/AppToasts.vue';
import AppModal  from '@/components/ui/AppModal.vue';
</script>
