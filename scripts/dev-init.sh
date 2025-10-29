pnpm i --frozen-lockfile

mkdir -p data/.vendor

LEXICAL_TAG="v$(node -p "require('./node_modules/lexical/package.json').version")"
rm -rf data/.vendor/lexical
git -C data/.vendor -c advice.detachedHead=false clone --depth 1 \
  --branch "$LEXICAL_TAG" https://github.com/facebook/lexical.git lexical

LEXICAL_VUE_TAG="$(node -p "require('./node_modules/lexical-vue/package.json').version")"
rm -rf data/.vendor/lexical-vue
git -C data/.vendor -c advice.detachedHead=false clone --depth 1 \
  --branch "lexical-vue@$LEXICAL_VUE_TAG" https://github.com/wobsoriano/lexical-vue.git lexical-vue
