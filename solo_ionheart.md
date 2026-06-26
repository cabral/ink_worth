---
layout: default
title: ION Heart
permalink: /solo_ionheart/
description: "A solo journaling blog for ION Heart by Parable Games: a Pilot, a Mech, and the Astral Union, one Story Circuit at a time."
---

# ION Heart

This is the journal for my solo game of [ION Heart](https://www.parablegames.co.uk/pages/ion-heart) by Parable Games. A Pilot, a Mech that remembers its old pilots, and a galaxy called the Astral Union putting itself back together after a war.

Each entry is one or more Story Circuits played out by hand and then edited for reading here. The handwritten notebook is the original; this is the cleaned-up version of it. New entries go up as I play them.

{% assign entries = site.categories['ion-heart'] %}
{% if entries and entries != empty %}
<ul class="post-list">
  {% for post in entries %}
  <li>
    <span class="post-meta">{{ post.date | date: "%B %-d, %Y" }}</span>
    <h2><a href="{{ post.url | relative_url }}">{{ post.title | escape }}</a></h2>
    {% if post.excerpt %}{{ post.excerpt | strip_html | truncatewords: 40 }}{% endif %}
  </li>
  {% endfor %}
</ul>
{% else %}
<p>No entries yet. The first one is coming.</p>
{% endif %}

[Back home]({{ '/' | relative_url }})
