import { mount } from 'svelte';
import '$lib/styles/base.css';
import '../themes/index.ts';
import { connect } from '$lib/client.svelte.ts';
import Tv from './Tv.svelte';

connect('tv');
mount(Tv, { target: document.getElementById('app')! });
