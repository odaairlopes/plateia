/**
 * Contract between the shell and its micro frontends: every exposed module is
 * a routable page with no props. Data flows through the URL and shared
 * contexts, never through props, which keeps the remotes independently
 * deployable.
 */
declare module 'catalog/EventsPage' {
  const Page: import('react').ComponentType;
  export default Page;
}

declare module 'catalog/EventDetailPage' {
  const Page: import('react').ComponentType;
  export default Page;
}

declare module 'booking/SeatSelectionPage' {
  const Page: import('react').ComponentType;
  export default Page;
}

declare module 'admin/AdminApp' {
  const Page: import('react').ComponentType;
  export default Page;
}

declare module 'booking/OrderPage' {
  const Page: import('react').ComponentType;
  export default Page;
}
