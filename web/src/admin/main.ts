import { mount } from 'svelte';
import '$lib/styles/base.css';
import '../themes/index.ts';
import { connect, storageSet } from '$lib/client.svelte.ts';
import Admin from './Admin.svelte';

// A pairing link (QR from the PC admin screen) carries a fresh admin token
const pair = new URLSearchParams(location.hash.slice(1)).get('pair');
if (pair) {
  storageSet('hb.adminToken', pair);
  history.replaceState(null, '', location.pathname);
}

connect('admin');
mount(Admin, { target: document.getElementById('app')! });
