import { env } from '#config/env.js';
import { logger } from '#shared/utils/logger.js';

/**
 * Calls OpenWeatherMap to get current weather at a location.
 *
 * @param {{ lat: number, lng: number }} location
 * @returns {{ condition: string, description: string, isHazardous: boolean, responseTimeMs: number }}
 * @throws {Error} if weather request fails
 */
export const getWeather = async (location) => {
  const url = `${env.WEATHER_API_URL}/weather?lat=${location.lat}&lon=${location.lng}&appid=${env.WEATHER_API_KEY}&units=metric`;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      logger.warn(`Weather request failed with status ${response.status} for URL: ${url}`);
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();

    const condition = data.weather?.[0]?.main ?? 'Clear';
    const description = data.weather?.[0]?.description ?? 'clear sky';

    return {
      condition,
      description,
      isHazardous: _isHazardous(condition),
      responseTimeMs,
    };
  } catch (error) {
    logger.warn(`Weather request failed for ${location.lat},${location.lng}: ${error.message}`);
    throw error;
  }
};

/**
 * Returns true if the weather condition affects driving safety.
 *
 * @param {string} condition
 * @returns {boolean}
 */
const _isHazardous = (condition) => {
  const hazardous = ['Thunderstorm', 'Snow', 'Fog', 'Tornado', 'Squall', 'Rain'];
  return hazardous.includes(condition);
};
