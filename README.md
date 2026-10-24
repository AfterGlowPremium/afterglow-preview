# Afterglow Real — Sunrise & Sunset (East Coast)

Third standalone Afterglow build, for side-by-side comparison with:
- Canvas app: https://afterglowpremium.github.io/afterglow-sunset/
- Realistic preview: https://afterglowpremium.github.io/afterglow-events/

Welcome page -> Sunrise (east-facing views) or Sunset (west-facing views). Each spot opens a forecast-driven WebGL sky render
(NOAA HRRR/GFS cloud decks, GOES satellite cross-check) with a time slider and Play.

Weather is drawn only when the forecast predicts it: clouds from HRRR/GFS cover, rain streaks only when precipitation is forecast,
lightning only for thunderstorm weather codes, a rainbow arc only near the model's rainbow time when odds >= 15%.

Clips: shots/clearwater-epic-sunset.mp4 (clouds from HRRR/GOES), shots/montauk-rain-sunset.mp4 (rain shown because rain is forecast).

Featured: Clearwater Beach (Pier 60) sunset render — `?mode=sunset&spot=clearwater&t=peak&play=1`.
Forecast render, not a photo.
