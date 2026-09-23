import { createBrowserRouter, type RouteObject } from 'react-router'
import { Layout } from '../components/layout/Layout'
import { HomePage } from '../pages/HomePage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { CategoryStub, ProductStub, SearchStub, StubPage } from '../pages/StubPage'

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'collections/:slug', element: <CategoryStub /> },
      { path: 'search', element: <SearchStub /> },
      { path: 'products/:id', element: <ProductStub /> },
      { path: 'dashboard', element: <StubPage title="Dashboard" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
