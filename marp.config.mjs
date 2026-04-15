import layoutEngine from './engine/layout-engine.mjs'

export default {
  allowLocalFiles: true,
  html: true,
  themeSet: './themes',
  engine: ({ marp }) => marp.use(layoutEngine)
}
