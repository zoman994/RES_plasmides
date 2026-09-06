const COMMON_FEATURES_URL = '/common-features.json'

function emptyFeatureDatabase() {
  return {
    version: 'test',
    features: [],
  }
}

export function createCommonFeaturesFetch(fallbackFetch) {
  if (typeof fallbackFetch !== 'function') {
    throw new TypeError('createCommonFeaturesFetch requires a fallback fetch function')
  }

  return async function commonFeaturesTestFetch(...args) {
    if (args[0] === COMMON_FEATURES_URL) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => emptyFeatureDatabase(),
      }
    }

    return Reflect.apply(fallbackFetch, this, args)
  }
}

export { COMMON_FEATURES_URL }
