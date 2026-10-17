import React from 'react';
import { DrawerType, Product } from '../types';
import { handleImageError, getWaUrl } from '../utils/helpers';

interface DrawerProps {
  type: DrawerType;
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  whatsappNumber: string;
  onOpenProduct: (product: Product) => void;
  onRemoveItem: (id: string, drawerType: NonNullable<DrawerType>) => void;
  onClearAll?: (drawerType: NonNullable<DrawerType>) => void;
  onOpenCompareModal?: () => void;
}

export const Drawer: React.FC<DrawerProps> = ({
  type,
  isOpen,
  onClose,
  products,
  whatsappNumber,
  onOpenProduct,
  onRemoveItem,
  onClearAll,
  onOpenCompareModal,
}) => {
  if (!isOpen || !type) return null;

  const titles: Record<NonNullable<DrawerType>, string> = {
    wish: 'Wishlist',
    saved: 'Saved Products (Cart)',
    compare: 'Compare Products',
    recent: 'Recently Viewed',
  };

  const handleOrderAllCartOnWhatsApp = () => {
    if (products.length === 0) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://anmolkala.in';
    const itemsList = products
      .map(
        (p, index) =>
          `${index + 1}. *${p.name}*\n   Item ID: ${p.id} | Category: ${p.category}\n   Link: ${origin}/product/${p.slug}`
      )
      .join('\n\n');

    const msg = `Hello AnmolKala,\n\nI would like to place an order / enquire about the following ${products.length} item(s) from my cart:\n\n${itemsList}\n\n*Total Items:* ${products.length}\nPlease confirm availability, total price including shipping, and customization options.`;

    const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className={`drawer open`} aria-modal="true" role="dialog">
        <div className="dhead">
          <div>
            <h2>{titles[type]}</h2>
            {products.length > 0 && (
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                {products.length} {products.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close drawer">
            ×
          </button>
        </div>

        {type === 'saved' && products.length > 0 && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
                🛒 Cart Summary ({products.length})
              </span>
              {onClearAll && (
                <button
                  type="button"
                  onClick={() => onClearAll(type)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#991b1b',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Clear Cart
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleOrderAllCartOnWhatsApp}
              style={{
                width: '100%',
                background: '#15803d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)',
              }}
            >
              <span>💬</span> Order Entire Cart on WhatsApp ({products.length})
            </button>
          </div>
        )}

        {type === 'compare' && products.length > 1 && onOpenCompareModal && (
          <div style={{ marginBottom: '14px' }}>
            <button
              type="button"
              className="ak-primary"
              style={{ width: '100%', padding: '10px' }}
              onClick={() => {
                onClose();
                onOpenCompareModal();
              }}
            >
              ⇄ View Side-by-Side Comparison
            </button>
          </div>
        )}

        {products.length === 0 ? (
          <p className="muted" style={{ padding: '20px 0' }}>Nothing here yet.</p>
        ) : (
          <div>
            {products.map((p) => (
              <div key={p.id} className="row">
                <img
                  src={p.image_url || p.image || '/logo.png'}
                  alt={p.name}
                  onError={handleImageError}
                />
                <main>
                  <b>{p.name}</b>
                  <div className="muted">{p.category} · {p.id}</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenProduct(p);
                      }}
                    >
                      View
                    </button>
                    <a
                      href={getWaUrl(p, whatsappNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        border: '1px solid #159447',
                        background: '#159447',
                        color: '#fff',
                        padding: '6px 8px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        marginTop: '7px',
                        marginRight: '6px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        display: 'inline-block',
                      }}
                    >
                      WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(p.id, type)}
                      style={{ color: '#b42318' }}
                      title="Remove"
                    >
                      Remove
                    </button>
                  </div>
                </main>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
