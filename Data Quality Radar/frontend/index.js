import React from 'react';
import {initializeBlock} from '@airtable/blocks/interface/ui';
import App from './App';

initializeBlock({interface: () => <App />});
