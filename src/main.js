const { nanoid } = require('nanoid');
const _ = require('lodash');
const axios = require('axios');

const NOOP = () => {};

class RpcMethodSpec {
  constructor(key, exec, configure = NOOP) {
    if (!_.isString(key)) {
      throw new Error('`key` MUST be a "string"');
    }
    if (!_.isFunction(exec)) {
      throw new Error('`exec` MUST be a "function"');
    }
    if (!_.isFunction(configure)) {
      throw new Error('`configure` MUST be a "function"');
    }
    this.key = key;
    this.exec = exec.bind(this);
    this.configure = configure.bind(this);
  }
  static test(obj) {
    return obj instanceof RpcMethodSpec;
  }
}

const DEFAULT_RPC_REQUEST = {
  method: 'utils.error',
  params: { code: 30400, message: 'missing' },
  id: null,
};

const decorateRpcError = (res, code, message, data) =>
  (res.error = { code, message, data });

class RpcRegistry {
  constructor() {
    this.methodSpecs = {};
  }

  registerAll(methodSpecs) {
    if (!_.isArray(methodSpecs)) {
      throw new Error('`methodSpecs` MUST be an array');
    }
    methodSpecs.forEach(this.register.bind(this));
  }

  register(methodSpec) {
    if (!RpcMethodSpec.test(methodSpec)) {
      throw new Error('`methodSpec` MUST be an `RpcMethodSpec`');
    }
    this.methodSpecs[methodSpec.key] = methodSpec;
    methodSpec.configure(this);
  }

  get(method) {
    return this.methodSpecs[method];
  }

  async handle(rpcRequest = DEFAULT_RPC_REQUEST) {
    const startTime = Date.now();
    const { method, params, id } = rpcRequest;
    const methodSpec = this.get(method);
    const res = { id };
    if (!RpcMethodSpec.test(methodSpec)) {
      decorateRpcError(res, 30404, `Method "${method}" not found`);
    } else {
      try {
        res.results = await methodSpec.exec(params);
      } catch (err) {
        const { code = 500, message = 'Unknown error', data } = err;
        decorateRpcError(res, code, message, data);
      }
    }
    const durationMs = Date.now() - startTime;
    res.metrics = { startTime, durationMs };
    return res;
  }
}
const LOAD_TEST_METHOD = [
  'loadtest.soak',
  async (params) => {
    const startTime = Date.now();
    const { sub, iterations, concurrency = 1 } = params;
    const { method: subMethod, params: subParams } = sub;
    const methodSpec = this.registry.get(subMethod);
    let res;
    if (!RpcMethodSpec.test(methodSpec)) {
      decorateRpcError(res, 30404, `Method "${method}" not found`);
      res = res.error;
    } else {
      let i = 0;
      let errorCount = 0;
      try {
        while (i < iterations) {
          const batch = [];
          for (let j = 0; j < concurrency; j++, i++) {
            batch.push(methodSpec.exec(subParams));
          }
          await Promise.all(batch);
        }
      } catch (err) {
        errorCount++;
      }
      const durationMs = Math.max(1, Date.now() - startTime);
      const ratePerSecond = (i * 1000) / durationMs;
      const errorRate = errorCount / i;
      res = {
        iterations: i,
        startTime,
        durationMs,
        ratePerSecond,
        errorCount,
        errorRate,
      };
    }
    return res;
  },
  (registry) => {
    this.registry = registry;
  },
];
const METHODS = [
  new RpcMethodSpec('utils.log', (params) => console.log({ params })),
  new RpcMethodSpec('math.add', ({ a, b }) => a + b),
  new RpcMethodSpec('math.sum', (params = []) =>
    params.reduce((p, c) => p + c, 0),
  ),
  new RpcMethodSpec('rest.call', async ({ req }) => {
    try {
      const res = await axios(req);
      const { status, data, headers } = res;
      return { status, data, headers };
    } catch (err) {
      const { status, headers, data } = err;
      return { status, data, headers };
    }
  }),
  new RpcMethodSpec(...LOAD_TEST_METHOD),
];
const registry = new RpcRegistry();
registry.registerAll(METHODS);

const test = async (method, params) => {
  const req = { method, params, id: nanoid(8) };
  await registry.handle({ method: 'utils.log', params: req });
  const res = await registry.handle(req);
  console.log(res);
};

(async function () {
  //   await test('math.add', { a: 1, b: 2 });
  //   await test('math.sum', [1, 2, 3, 4, 5]);
  //   await test('loadtest.soak', {
  //     iterations: 100_000,
  //     sub: {
  //       method: 'math.add',
  //       params: { a: 100, b: 47 },
  //     },
  //   });
  const testCase = [
    'loadtest.soak',
    {
      iterations: 1000,
      concurrency: 7,
      sub: {
        method: 'rest.call',
        params: {
          req: {
            url: 'http://localhost:3032/count',
            method: 'POST',
          },
        },
      },
    },
  ];
  await Promise.all([test(...testCase), test(...testCase)]);
})();
