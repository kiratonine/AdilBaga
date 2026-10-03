/**
 * Меняет query текущей страницы без запроса к серверу: Next синхронизирует usePathname/useSearchParams
 * с history API. router.replace перерисовал бы динамическую страницу на сервере ради того, что клиент
 * и так загрузит сам (фильтры, сортировка)
 */
export function replaceQuery(pathname: string, params: URLSearchParams) {
  const search = params.toString()
  window.history.replaceState(null, '', search ? `${pathname}?${search}` : pathname)
}
