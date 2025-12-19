import { Test, TestingModule } from "@nestjs/testing";
import { SearchService } from "./search.service";
import { PrismaService } from "../prisma/prisma.service";
import { FullTextSearchStrategy } from "./strategies/fulltext-search.strategy";
import {
  SearchInput,
  SearchType,
  SearchSortBy,
  AutocompleteInput,
  RecommendationInput,
  TrackSearchClickInput,
  TrackItemViewInput,
} from "./dto/search.input";
import { SearchResultType } from "./entities/search-result.entity";

describe("SearchService", () => {
  let service: SearchService;
  let prismaService: PrismaService;
  let fullTextSearchStrategy: FullTextSearchStrategy;

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    storeProduct: {
      update: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    searchLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
    },
    searchClick: {
      create: jest.fn(),
    },
    itemView: {
      create: jest.fn(),
    },
    popularSearch: {
      upsert: jest.fn(),
    },
  };

  const mockFullTextSearchStrategy = {
    searchProducts: jest.fn(),
    searchStoreProducts: jest.fn(),
    searchServices: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: FullTextSearchStrategy,
          useValue: mockFullTextSearchStrategy,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prismaService = module.get<PrismaService>(PrismaService);
    fullTextSearchStrategy = module.get<FullTextSearchStrategy>(
      FullTextSearchStrategy
    );

    // Reset all mocks before each test
    jest.clearAllMocks();

    // Set default return values for common queries
    mockPrismaService.product.findMany.mockResolvedValue([]);
    mockPrismaService.service.findMany.mockResolvedValue([]);
    mockPrismaService.searchLog.groupBy.mockResolvedValue([]);
  });

  describe("search", () => {
    it("should return search results with products and services", async () => {
      const searchInput: SearchInput = {
        query: "laptop gaming",
        type: SearchType.ALL,
        page: 1,
        pageSize: 20,
        sortBy: SearchSortBy.RELEVANCE,
      };

      const mockProducts = [
        {
          id: 1,
          type: SearchResultType.PRODUCT,
          name: "Gaming Laptop XPS",
          description: "High performance gaming laptop",
          price: 1500,
          images: ["img1.jpg"],
          category: "Electronics",
          tags: ["gaming", "laptop"],
          relevanceScore: 0,
        },
      ];

      const mockServices = [
        {
          id: 2,
          type: SearchResultType.SERVICE,
          name: "Laptop Repair Service",
          description: "Professional laptop repair",
          price: 50,
          images: [],
          category: "Tech Services",
          tags: ["repair", "laptop"],
          relevanceScore: 0,
        },
      ];

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue(mockProducts);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue(mockServices);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 1 });

      const result = await service.search(searchInput);

      expect(result).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.items[0].relevanceScore).toBeGreaterThan(0);
      expect(result.pageInfo.currentPage).toBe(1);
      expect(result.pageInfo.totalItems).toBe(2);
      expect(result.query).toBe("laptop gaming");
      expect(mockFullTextSearchStrategy.searchProducts).toHaveBeenCalled();
      expect(mockFullTextSearchStrategy.searchServices).toHaveBeenCalled();
    });

    it("should filter results by type PRODUCTS only", async () => {
      const searchInput: SearchInput = {
        query: "phone",
        type: SearchType.PRODUCTS,
        page: 1,
        pageSize: 20,
      };

      const mockProducts = [
        {
          id: 1,
          type: SearchResultType.PRODUCT,
          name: "iPhone 14",
          price: 999,
          relevanceScore: 0,
        },
      ];

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue(mockProducts);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue([]);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 2 });

      const result = await service.search(searchInput);

      expect(mockFullTextSearchStrategy.searchProducts).toHaveBeenCalled();
      expect(mockFullTextSearchStrategy.searchServices).not.toHaveBeenCalled();
      expect(
        result.items.every((item) => item.type === SearchResultType.PRODUCT)
      ).toBe(true);
    });

    it("should apply price filters", async () => {
      const searchInput: SearchInput = {
        query: "laptop",
        type: SearchType.ALL,
        minPrice: 500,
        maxPrice: 2000,
        page: 1,
        pageSize: 20,
      };

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue([]);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 3 });

      await service.search(searchInput);

      expect(mockFullTextSearchStrategy.searchProducts).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          minPrice: 500,
          maxPrice: 2000,
        })
      );
    });

    it("should paginate results correctly", async () => {
      const searchInput: SearchInput = {
        query: "test",
        page: 2,
        pageSize: 5,
      };

      const mockProducts = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        type: SearchResultType.PRODUCT,
        name: `Product ${i + 1}`,
        price: 100,
        relevanceScore: 0,
      }));

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue(mockProducts);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue([]);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 4 });

      const result = await service.search(searchInput);

      expect(result.items).toHaveLength(5);
      expect(result.pageInfo.currentPage).toBe(2);
      expect(result.pageInfo.totalPages).toBe(3);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.hasPreviousPage).toBe(true);
    });

    it("should add highlighting to search results", async () => {
      const searchInput: SearchInput = {
        query: "gaming laptop",
        page: 1,
        pageSize: 20,
      };

      const mockProducts = [
        {
          id: 1,
          type: SearchResultType.PRODUCT,
          name: "Gaming Laptop Pro",
          description: "The best gaming laptop for professionals",
          price: 2000,
          relevanceScore: 0,
        },
      ];

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue(mockProducts);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue([]);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 5 });

      const result = await service.search(searchInput);

      expect(result.items[0].highlightedName).toContain("<mark>");
      expect(result.items[0].highlightedDescription).toContain("<mark>");
    });

    it("should sort results by price ascending", async () => {
      const searchInput: SearchInput = {
        query: "product",
        sortBy: SearchSortBy.PRICE_ASC,
        page: 1,
        pageSize: 20,
      };

      const mockProducts = [
        {
          id: 1,
          name: "Product A",
          price: 300,
          relevanceScore: 0,
          type: SearchResultType.PRODUCT,
        },
        {
          id: 2,
          name: "Product B",
          price: 100,
          relevanceScore: 0,
          type: SearchResultType.PRODUCT,
        },
        {
          id: 3,
          name: "Product C",
          price: 200,
          relevanceScore: 0,
          type: SearchResultType.PRODUCT,
        },
      ];

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue(mockProducts);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue([]);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 6 });

      const result = await service.search(searchInput);

      expect(result.items[0].price).toBe(100);
      expect(result.items[1].price).toBe(200);
      expect(result.items[2].price).toBe(300);
    });

    it("should generate suggestions when few results found", async () => {
      const searchInput: SearchInput = {
        query: "rare item",
        page: 1,
        pageSize: 20,
      };

      mockFullTextSearchStrategy.searchProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchStoreProducts.mockResolvedValue([]);
      mockFullTextSearchStrategy.searchServices.mockResolvedValue([]);
      mockPrismaService.searchLog.create.mockResolvedValue({ id: 7 });
      mockPrismaService.product.findMany.mockResolvedValue([
        { name: "Similar Item" },
        { name: "Rare Product" },
      ]);
      mockPrismaService.service.findMany.mockResolvedValue([
        { name: "Related Service" },
      ]);

      const result = await service.search(searchInput);

      expect(result.suggestions).toBeDefined();
      expect(result.pageInfo.totalItems).toBeLessThan(5);
    });
  });

  describe("autocomplete", () => {
    it("should return autocomplete suggestions", async () => {
      const autocompleteInput: AutocompleteInput = {
        query: "lap",
        limit: 8,
        type: SearchType.ALL,
      };

      const mockProducts = [
        {
          id: 1,
          name: "Laptop Dell",
          productCategory: { productCategoryName: "Computers" },
        },
        {
          id: 2,
          name: "Laptop HP",
          productCategory: { productCategoryName: "Computers" },
        },
      ];

      const mockServices = [
        {
          id: 1,
          name: "Laptop Repair",
          serviceCategory: { subCategory: "Tech Support" },
        },
      ];

      mockPrismaService.product.findMany.mockResolvedValue(mockProducts);
      mockPrismaService.service.findMany.mockResolvedValue(mockServices);
      mockPrismaService.searchLog.groupBy.mockResolvedValue([
        { query: "laptop", _count: { query: 10 } },
      ]);

      const result = await service.autocomplete(autocompleteInput);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0].score).toBeGreaterThan(0);
      expect(result.popularSearches).toBeDefined();
    });

    it("should return popular searches when query is too short", async () => {
      const autocompleteInput: AutocompleteInput = {
        query: "a",
        limit: 8,
      };

      mockPrismaService.searchLog.groupBy.mockResolvedValue([
        { query: "laptop", _count: { query: 15 } },
        { query: "phone", _count: { query: 12 } },
      ]);

      const result = await service.autocomplete(autocompleteInput);

      expect(result.suggestions).toHaveLength(0);
      expect(result.popularSearches).toBeDefined();
      expect(result.popularSearches.length).toBeGreaterThan(0);
    });

    it("should filter autocomplete by type SERVICES only", async () => {
      const autocompleteInput: AutocompleteInput = {
        query: "repair",
        type: SearchType.SERVICES,
        limit: 8,
      };

      const mockServices = [
        {
          id: 1,
          name: "Repair Service",
          serviceCategory: { subCategory: "Maintenance" },
        },
      ];

      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.service.findMany.mockResolvedValue(mockServices);
      mockPrismaService.searchLog.groupBy.mockResolvedValue([]);

      const result = await service.autocomplete(autocompleteInput);

      expect(mockPrismaService.service.findMany).toHaveBeenCalled();
      expect(
        result.suggestions.every((s) => s.type === SearchResultType.SERVICE)
      ).toBe(true);
    });
  });

  describe("getRecommendations", () => {
    it("should return recommendations based on query", async () => {
      const recommendationInput: RecommendationInput = {
        query: "laptop",
        limit: 10,
      };

      const mockProducts = [
        {
          id: 1,
          type: SearchResultType.PRODUCT,
          name: "Laptop Pro",
          description: "High end laptop",
          price: 1500,
          images: [],
          relevanceScore: 0.9,
        },
      ];

      const mockServices = [
        {
          id: 2,
          type: SearchResultType.SERVICE,
          name: "Laptop Setup",
          description: "Setup service",
          price: 50,
          images: [],
          relevanceScore: 0.8,
        },
      ];

      jest
        .spyOn(service as any, "searchProducts")
        .mockResolvedValue(mockProducts);
      jest
        .spyOn(service as any, "searchServices")
        .mockResolvedValue(mockServices);

      const result = await service.getRecommendations(recommendationInput);

      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.basedOn).toBe("laptop");
    });

    it("should return recommendations based on viewed products", async () => {
      const recommendationInput: RecommendationInput = {
        viewedProductIds: [1, 2],
        limit: 10,
      };

      const mockViewedProducts = [
        { productCategoryId: 5, interests: ["tech", "gaming"] },
        { productCategoryId: 5, interests: ["gaming"] },
      ];

      const mockSimilarProducts = [
        {
          id: 3,
          name: "Similar Product",
          description: "Similar to viewed",
          price: 500,
          images: [],
          productCategory: { productCategoryName: "Electronics" },
          seller: { id: "seller1" },
          createdAt: new Date(),
        },
      ];

      mockPrismaService.product.findMany
        .mockResolvedValueOnce(mockViewedProducts)
        .mockResolvedValueOnce(mockSimilarProducts);

      const result = await service.getRecommendations(recommendationInput);

      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].reason).toContain("browsing history");
    });

    it("should return recommendations based on viewed services", async () => {
      const recommendationInput: RecommendationInput = {
        viewedServiceIds: [1, 2],
        limit: 10,
      };

      const mockViewedServices = [
        { subcategoryId: 3, tags: ["tech", "support"] },
      ];

      const mockSimilarServices = [
        {
          id: 4,
          name: "Similar Service",
          description: "Related service",
          basePrice: 100,
          images: [],
          serviceCategory: { subCategory: "Tech" },
          seller: { id: "seller2" },
          createdAt: new Date(),
        },
      ];

      mockPrismaService.service.findMany
        .mockResolvedValueOnce(mockViewedServices)
        .mockResolvedValueOnce(mockSimilarServices);

      const result = await service.getRecommendations(recommendationInput);

      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].type).toBe(SearchResultType.SERVICE);
    });

    it("should deduplicate recommendations", async () => {
      const recommendationInput: RecommendationInput = {
        query: "test",
        viewedProductIds: [1],
        limit: 10,
      };

      const duplicateProduct = {
        id: 1,
        type: SearchResultType.PRODUCT,
        name: "Test Product",
        price: 100,
        relevanceScore: 0.9,
      };

      jest
        .spyOn(service as any, "searchProducts")
        .mockResolvedValue([duplicateProduct]);
      jest.spyOn(service as any, "searchServices").mockResolvedValue([]);
      mockPrismaService.product.findMany
        .mockResolvedValueOnce([{ productCategoryId: 1, interests: [] }])
        .mockResolvedValueOnce([
          {
            id: 1,
            name: "Test Product",
            description: "Duplicate",
            price: 100,
            images: [],
            productCategory: {},
            seller: {},
            createdAt: new Date(),
          },
        ]);

      const result = await service.getRecommendations(recommendationInput);

      const uniqueIds = new Set(
        result.items.map((item) => `${item.type}-${item.id}`)
      );
      expect(uniqueIds.size).toBe(result.items.length);
    });
  });

  describe("getTrending", () => {
    it("should return trending searches, products, and services", async () => {
      const mockTrendingSearches = [
        { query: "laptop", _count: { query: 20 } },
        { query: "phone", _count: { query: 15 } },
      ];

      const mockTrendingProducts = [
        {
          id: 1,
          name: "Trending Product",
          description: "Popular product",
          price: 500,
          images: [],
          isActive: true,
          deletedAt: null,
          productCategory: { productCategoryName: "Electronics" },
          createdAt: new Date(),
        },
      ];

      const mockTrendingServices = [
        {
          id: 1,
          name: "Trending Service",
          description: "Popular service",
          basePrice: 100,
          images: [],
          isActive: true,
          serviceCategory: { subCategory: "Tech" },
          createdAt: new Date(),
        },
      ];

      mockPrismaService.searchLog.groupBy.mockResolvedValue(
        mockTrendingSearches
      );
      mockPrismaService.product.findMany.mockResolvedValue(
        mockTrendingProducts
      );
      mockPrismaService.service.findMany.mockResolvedValue(
        mockTrendingServices
      );

      const result = await service.getTrending();

      expect(result.searches).toBeDefined();
      expect(result.searches.length).toBe(2);
      expect(result.searches[0].query).toBe("laptop");
      expect(result.searches[0].trendScore).toBeGreaterThan(
        result.searches[1].trendScore
      );
      expect(result.products).toBeDefined();
      expect(result.products.length).toBeGreaterThan(0);
      expect(result.services).toBeDefined();
      expect(result.services.length).toBeGreaterThan(0);
    });

    it("should calculate trend scores correctly", async () => {
      const mockTrendingSearches = Array.from({ length: 5 }, (_, i) => ({
        query: `search${i}`,
        _count: { query: 10 - i },
      }));

      mockPrismaService.searchLog.groupBy.mockResolvedValue(
        mockTrendingSearches
      );
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.service.findMany.mockResolvedValue([]);

      const result = await service.getTrending();

      expect(result.searches[0].trendScore).toBe(1);
      expect(result.searches[1].trendScore).toBe(0.9);
      expect(result.searches[4].trendScore).toBe(0.6);
    });
  });

  describe("trackClick", () => {
    it("should track search click successfully", async () => {
      const trackClickInput: TrackSearchClickInput = {
        searchId: 1,
        itemId: 10,
        itemType: "PRODUCT",
        position: 1,
        userId: "user123",
      };

      const mockSearchLog = {
        id: 1,
        query: "laptop",
        resultCount: 5,
        createdAt: new Date(),
      };

      mockPrismaService.searchClick.create.mockResolvedValue({});
      mockPrismaService.searchLog.findUnique.mockResolvedValue(mockSearchLog);
      mockPrismaService.popularSearch.upsert.mockResolvedValue({});

      const result = await service.trackClick(trackClickInput);

      expect(result).toBe(true);
      expect(mockPrismaService.searchClick.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          searchId: 1,
          itemId: 10,
          itemType: "PRODUCT",
          position: 1,
          userId: "user123",
        }),
      });
      expect(mockPrismaService.popularSearch.upsert).toHaveBeenCalled();
    });

    it("should return false on tracking error", async () => {
      const trackClickInput: TrackSearchClickInput = {
        searchId: 1,
        itemId: 10,
        itemType: "PRODUCT",
        position: 1,
      };

      mockPrismaService.searchClick.create.mockRejectedValue(
        new Error("DB Error")
      );

      const result = await service.trackClick(trackClickInput);

      expect(result).toBe(false);
    });

    it("should update popular search click count", async () => {
      const trackClickInput: TrackSearchClickInput = {
        searchId: 1,
        itemId: 10,
        itemType: "SERVICE",
        position: 2,
      };

      const mockSearchLog = {
        id: 1,
        query: "repair service",
        resultCount: 3,
        createdAt: new Date(),
      };

      mockPrismaService.searchClick.create.mockResolvedValue({});
      mockPrismaService.searchLog.findUnique.mockResolvedValue(mockSearchLog);
      mockPrismaService.popularSearch.upsert.mockResolvedValue({});

      await service.trackClick(trackClickInput);

      expect(mockPrismaService.popularSearch.upsert).toHaveBeenCalledWith({
        where: { query: "repair service" },
        update: {
          clickCount: { increment: 1 },
          lastSearched: expect.any(Date),
        },
        create: {
          query: "repair service",
          searchCount: 1,
          clickCount: 1,
        },
      });
    });
  });

  describe("trackView", () => {
    it("should track item view for PRODUCT successfully", async () => {
      const trackViewInput: TrackItemViewInput = {
        itemId: 5,
        itemType: "PRODUCT",
        userId: "user456",
        sessionId: "session789",
        duration: 120,
        source: "search",
      };

      mockPrismaService.itemView.create.mockResolvedValue({});
      mockPrismaService.product.update.mockResolvedValue({});

      const result = await service.trackView(trackViewInput);

      expect(result).toBe(true);
      expect(mockPrismaService.itemView.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          itemId: 5,
          itemType: "PRODUCT",
          userId: "user456",
          sessionId: "session789",
          duration: 120,
          source: "search",
        }),
      });
      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { viewCount: { increment: 1 } },
      });
    });

    it("should track item view for SERVICE successfully", async () => {
      const trackViewInput: TrackItemViewInput = {
        itemId: 3,
        itemType: "SERVICE",
        sessionId: "session123",
      };

      mockPrismaService.itemView.create.mockResolvedValue({});
      mockPrismaService.service.update.mockResolvedValue({});

      const result = await service.trackView(trackViewInput);

      expect(result).toBe(true);
      expect(mockPrismaService.service.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { viewCount: { increment: 1 } },
      });
    });

    it("should track item view for STORE_PRODUCT successfully", async () => {
      const trackViewInput: TrackItemViewInput = {
        itemId: 7,
        itemType: "STORE_PRODUCT",
        userId: "user789",
      };

      mockPrismaService.itemView.create.mockResolvedValue({});
      mockPrismaService.storeProduct.update.mockResolvedValue({});

      const result = await service.trackView(trackViewInput);

      expect(result).toBe(true);
      expect(mockPrismaService.storeProduct.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { viewCount: { increment: 1 } },
      });
    });

    it("should return false on tracking error", async () => {
      const trackViewInput: TrackItemViewInput = {
        itemId: 1,
        itemType: "PRODUCT",
      };

      mockPrismaService.itemView.create.mockRejectedValue(
        new Error("DB Error")
      );

      const result = await service.trackView(trackViewInput);

      expect(result).toBe(false);
    });

    it("should handle item view without user ID", async () => {
      const trackViewInput: TrackItemViewInput = {
        itemId: 2,
        itemType: "PRODUCT",
        sessionId: "anon-session",
      };

      mockPrismaService.itemView.create.mockResolvedValue({});
      mockPrismaService.product.update.mockResolvedValue({});

      const result = await service.trackView(trackViewInput);

      expect(result).toBe(true);
      expect(mockPrismaService.itemView.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: undefined,
          sessionId: "anon-session",
        }),
      });
    });
  });
});
