import React from 'react';
import {initializeBlock} from '@airtable/blocks/interface/ui';
import App from './components/App';

initializeBlock({interface: () => <App />});
