# Ruby compatibility shim, loaded from the Gemfile (NOT as a Jekyll plugin).
#
# The github-pages gem pins old Jekyll 3.9.0 / Liquid 4.0.3, which still call
# Object#taint / #untaint / #tainted?. Ruby deprecated them in 2.7 and *removed*
# them in 3.2, so on modern Ruby (3.2+/4.0) old Liquid blows up with
# "undefined method 'untaint'". Re-add them as no-ops.
#
# It lives under _plugins/ only so it's never copied into the built _site. The
# github-pages gem runs Jekyll in safe mode, which ignores _plugins, so this is
# required explicitly from the Gemfile (Bundler evaluates the Gemfile in-process
# before launching Jekyll). The `unless` guard makes it a no-op on Ruby < 3.2,
# so it's harmless if it ever loads in GitHub Pages' build environment.
unless Object.method_defined?(:untaint)
  class Object
    def taint;     self; end
    def untaint;   self; end
    def tainted?;  false; end
  end
end
