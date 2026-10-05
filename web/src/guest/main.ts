import { mount } from 'svelte';
import '$lib/styles/base.css';
import '../themes/index.ts';
import { connect } from '$lib/client.svelte.ts';
import Guest from './Guest.svelte';

connect('guest');
mount(Guest, { target: document.getElementById('app')! });
