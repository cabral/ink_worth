---
layout: page
title: ION Heart
label: "Part 03 · Solo journal"
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
    <time class="post-meta" datetime="{{ post.date | date: '%F' }}">{{ post.date | date: "%B %-d, %Y" }}</time>
    <h2><a href="{{ post.url | relative_url }}">{{ post.title | escape }}</a></h2>
    {% if post.excerpt %}<p>{{ post.excerpt | strip_html | truncatewords: 40 }}</p>{% endif %}
  </li>
  {% endfor %}
</ul>
{% else %}
<p>No entries yet. The first one is coming.</p>
{% endif %}

<p class="feed-link"><a href="{{ '/feed.xml' | relative_url }}">Follow new entries by RSS</a></p>
