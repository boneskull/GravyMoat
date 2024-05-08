import 'ses';

import {register} from 'node:module';

lockdown({
  // gives a semi-high resolution timer
  dateTaming: 'unsafe',
  // this is introduces non-determinism, but is otherwise safe
  mathTaming: 'unsafe',
  // lets code observe call stack, but easier debuggability
  errorTaming: 'unsafe',
  // shows the full call stack
  stackFiltering: 'verbose',
  // prevents most common override mistake cases from tripping up users
  overrideTaming: 'severe',
  // preserves JS locale methods, to avoid confusing users
  // prevents aliasing: toLocaleString() to toString(), etc
  localeTaming: 'unsafe',
});


register('./hooks.js', import.meta.url, {
  data: {stuff: 'things'}
});
register('./more-hooks.js', import.meta.url);

