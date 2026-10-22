# Renders one view with Ruby Liquid, the engine TRMNL runs.
#
# Usage: ruby render.rb <src dir> <view> < context.json   → HTML on stdout; errors on stderr, exit 1.
# Adapted from nikokoren/downstream recipe/tools/render.rb. This plugin has no Shared tab, so
# there are no partials to collect.
Encoding.default_external = Encoding::UTF_8
require "json"
require "liquid"

src, view = ARGV.fetch(0), ARGV.fetch(1)
template = Liquid::Template.parse(File.read(File.join(src, "#{view}.liquid")), error_mode: :strict)
print template.render!(JSON.parse($stdin.read), strict_filters: true)
