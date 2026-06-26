source "https://rubygems.org"

# Re-add Ruby methods that old Jekyll/Liquid (pinned by github-pages) need but
# that modern Ruby removed. Bundler evaluates this Gemfile in the same process
# before launching Jekyll, so the shim is in effect even under safe mode (which
# disables _plugins). See _plugins/ruby_compat_shim.rb for details.
require_relative "_plugins/ruby_compat_shim"

# Use the github-pages gem so local builds match GitHub Pages' native build.
gem "github-pages", group: :jekyll_plugins

# Theme: Minima. github-pages pins a compatible version.
gem "minima"

# Ruby 3.4+/4.0 removed these from the default gems, but the (old) Jekyll
# 3.9.0 that github-pages pins still expects them. webrick was dropped from
# the stdlib in Ruby 3.0 and is required by `jekyll serve`.
gem "csv"
gem "base64"
gem "bigdecimal"
gem "logger"
gem "webrick"

group :jekyll_plugins do
  gem "jekyll-feed"
  gem "jekyll-seo-tag"
end

# Windows and JRuby do not include zoneinfo files; bundle tzinfo-data.
platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

# Performance booster for watching directories on Windows.
gem "wdm", "~> 0.1.1", platforms: [:mingw, :x64_mingw, :mswin]
