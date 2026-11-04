<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
const theme = { common: { borderRadiusSmall: '10px', primaryColor: '#2f6bff', primaryColorHover: '#4f7fff', primaryColorPressed: '#1d4ed8', bodyColor: '#f6f9fc', cardColor: '#ffffff', modalColor: '#ffffff', popoverColor: '#ffffff', textColorBase: '#0f172a' } };
</script>
<template><NConfigProvider :theme-overrides="theme"><NMessageProvider><NDialogProvider><RouterView /></NDialogProvider></NMessageProvider></NConfigProvider></template>
