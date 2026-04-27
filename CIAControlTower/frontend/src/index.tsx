import {initializeBlock} from '@airtable/blocks/interface/ui';
import {Dashboard} from './components/Dashboard';
import {injectGlobalStyles} from './styles/globals';

injectGlobalStyles();

initializeBlock(() => <Dashboard />);
