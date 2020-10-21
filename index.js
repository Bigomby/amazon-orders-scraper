const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const Papa = require('papaparse');

const URL = 'https://www.amazon.es/gp/css/order-history';
const ORDERS_SELECTOR = '.order .a-fixed-left-grid > .a-fixed-left-grid-inner > .a-fixed-left-grid-col.a-col-right';
const ORDER_COUNT_SELECTOR = '.num-orders';
const ITEMS_PER_PAGE = 10;

// Login to Amazon and get your cookie from the developer console
const COOKIE = '';

/**
 * Fetch the number of pages to scrape
 *
 * @param  {string} filter  You can provide a filter like "year-YYYY" to filter by year.
 * @return {Promise<number>}         Number of pages
 */
const fetchPageCount = async (cookie, filter) => {
  const headers = { Cookie: cookie };
  const params = { orderFilter: filter };

  const { data } = await axios.get(URL, { headers, params });

  return parsePageCount(data);
};

/**
 * Fetch all items in a page
 *
 * @param  {number} pageIndex   Page to fetch
 * @return {array}              List containing scraped items
 */
const fetchPage = async (cookie, pageIndex, filter) => {
  console.log(`Fetching [ filter="${filter}" page="${pageIndex}"]`);

  const headers = { Cookie: cookie };
  const params = { startIndex: pageIndex * ITEMS_PER_PAGE, orderFilter: filter };

  const { data } = await axios.get(URL, { headers, params });

  const orders = parseOrders(data);

  console.log(`Done [ filter="${filter}" page="${pageIndex}" ]`);

  return orders;
};

/**
 * Parses items count and computes the number of pages available
 *
 * @param  {object} content HTML content
 * @return {number}         Number of pages available
 */
const parsePageCount = (content) => {
  const $ = cheerio.load(content);

  const el = $(ORDER_COUNT_SELECTOR);
  const [amount] = el.text().split(' ');
  if (!amount) {
    return null;
  }

  return Math.ceil(parseInt(amount) / ITEMS_PER_PAGE);
};

/**
 * Parses all orders in a page
 *
 * @param  {object} content HTML content
 * @return {array}          List containing all scraped items on the page
 */
const parseOrders = (content) => {
  const $ = cheerio.load(content);

  return $(ORDERS_SELECTOR)
    .toArray()
    .flatMap((val) =>
      $(val)
        .toArray()
        .map((el) => {
          const $ = cheerio.load(content);

          const title = $('.a-row > a', el);
          const rawPrice = $('.a-row > span.a-size-small.a-color-price', el);

          const [, price] = rawPrice.text().trim().split(' ');
          if (!price) {
            return null;
          }

          if (isNaN(parseFloat(price.replace(',', '.')))) {
            return null;
          }

          return {
            title: title.text().trim(),
            price: price,
          };
        }),
    );
};

const fetchOrders = (cookie) => async (filter) => {
  const pageCount = await fetchPageCount(cookie, filter);
  if (!pageCount) {
    throw new Error('Cannot fetch page count');
  }

  const pageIndexes = Array.from({ length: pageCount }).map((_, i) => i);
  const ordersPromises = pageIndexes.map((page) => fetchPage(COOKIE, page, filter));
  const orders = await Promise.all(ordersPromises);

  return orders.flat();
};

async function main() {
  const filters = [
    'year-2020',
    'year-2019',
    'year-2018',
    'year-2017',
    'year-2016',
    'year-2015',
    'year-2014',
    'year-2013',
  ];

  const ordersRaw = await Promise.all(filters.map(fetchOrders(COOKIE)));
  const orders = ordersRaw.flat().filter((x) => !!x);
  const csv = Papa.unparse(orders, { delimiter: '\t' });

  fs.writeFile(`output.json`, JSON.stringify(orders, null, 2), () => {});
  fs.writeFile(`output.csv`, csv, () => {});
}

main()
  .then(() => console.log('DONE!'))
  .catch((e) => console.error(e));
