// ==================== Supabase 初始化 ====================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 你的凭证（使用 Cloudflare Worker 代理）
const SUPABASE_URL = 'https://black-brook-8bb8.wang192515.workers.dev';
const SUPABASE_ANON_KEY = 'sb_publishable_FbpCE5UvEnCmuFcpRXMj5Q_hsFjm_ys';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== 卖家入口控制 ====================
const sellerSection = document.getElementById("sellerSection");
const sellerEntryBtn = document.getElementById("sellerEntryBtn");

sellerEntryBtn.addEventListener("click", () => {
  const password = prompt("请输入卖家密码：");
  if (password === "192515") {
    sellerSection.style.display = "block";
    sellerEntryBtn.style.display = "none";
    window.isSeller = true;
    // ✅ 重新渲染商品列表，立即显示删除按钮
    loadProducts();
  } else if (password !== null) {
    alert("密码错误！");
  }
});

// 退出卖家模式
window.hideSellerSection = function() {
  sellerSection.style.display = "none";
  sellerEntryBtn.style.display = "inline-block";
  window.isSeller = false;
  // ✅ 重新渲染商品列表，隐藏删除按钮
  loadProducts();
};

// ==================== 页面初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();

  // 图片预览
  document.getElementById("imageInput").addEventListener("change", function(e) {
    const file = e.target.files[0];
    const preview = document.getElementById("preview");
    if (file) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }
  });

  // 实时监听：INSERT 和 DELETE
  supabase
    .channel('products-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'products' },
      (payload) => {
        console.log('实时新增商品:', payload.new);
        prependProduct(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'products' },
      (payload) => {
        console.log('实时删除商品 ID:', payload.old.id);
        const productElement = document.getElementById(`product-${payload.old.id}`);
        if (productElement) productElement.remove();
      }
    )
    .subscribe();
});

// ==================== 加载所有商品 ====================
async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: false }); // 新建商品会出现在最上面

  if (error) {
    console.error("加载商品失败:", error.message);
    document.getElementById("products").innerText = "加载商品失败，请检查网络或 RLS 策略。";
    return;
  }

  const container = document.getElementById("products");
  container.innerHTML = "";
  data.forEach(product => renderProduct(product, container, false));
}

// ==================== 渲染单个商品卡片 ====================
function renderProduct(product, container, prepend = false) {
  const div = document.createElement("div");
  div.className = "product";
  div.id = `product-${product.id}`;

  let imgTag = "";
  if (product.image) {
    imgTag = `<img src="${escapeHtml(product.image)}" width="200" onerror="this.style.display='none'">`;
  }

  // 根据是否为卖家决定是否显示删除按钮
  const deleteButton = window.isSeller
    ? `<button onclick="deleteProduct(${product.id})" style="background:#e53935; color:white; margin-left:8px;">删除</button>`
    : '';

  div.innerHTML = `
    <div>
      <h3>${escapeHtml(product.name)}</h3>
      ${imgTag}
      <p>价格: ¥${product.price}</p>
      <p>${escapeHtml(product.category || '')}</p>
      <p>${escapeHtml(product.description || '')}</p>
      <button onclick="addToCart(${product.id})">加入购物车</button>
      ${deleteButton}
    </div>
  `;

  if (prepend) {
    container.prepend(div);
  } else {
    container.appendChild(div);
  }
}

// 实时监听时使用，插入到列表顶部
function prependProduct(product) {
  const container = document.getElementById("products");
  renderProduct(product, container, true);
}

// ==================== 上传图片到 Supabase Storage ====================
async function uploadImageToSupabase(file) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `public/${fileName}`;

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error("图片上传失败:", error.message);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(filePath);

  return publicUrl;
}

// ==================== 发布商品 ====================
window.publishProduct = async function() {
  const name = document.getElementById("name").value.trim();
  const price = document.getElementById("price").value;
  const category = document.getElementById("category").value.trim();
  const description = document.getElementById("description").value.trim();
  const fileInput = document.getElementById("imageInput");

  if (!name || !price) {
    alert("请填写商品名称和价格");
    return;
  }

  let imageUrl = "";
  if (fileInput.files.length > 0) {
    document.getElementById("uploadStatus").textContent = "正在上传图片...";
    imageUrl = await uploadImageToSupabase(fileInput.files[0]);
    if (!imageUrl) {
      document.getElementById("uploadStatus").textContent = "上传失败，请检查存储桶策略";
      return;
    }
    document.getElementById("uploadStatus").textContent = "图片上传成功";
  }

  const productData = {
    name,
    price: parseFloat(price),
    category,
    description,
    image: imageUrl
  };

  const { error } = await supabase
    .from('products')
    .insert([productData]);

  if (error) {
    alert("添加商品失败：" + error.message);
    return;
  }

  alert("商品发布成功！");
  // 清空表单（商品列表会由 Realtime 自动更新，无需手动刷新）
  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  document.getElementById("category").value = "";
  document.getElementById("description").value = "";
  fileInput.value = "";
  document.getElementById("preview").style.display = "none";
  document.getElementById("uploadStatus").textContent = "";
};

// ==================== 删除商品 ====================
window.deleteProduct = async function(id) {
  if (!confirm('确定要删除这个商品吗？')) return;

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    alert('删除失败：' + error.message);
    return;
  }

  // 立即从页面上移除该商品（即使 Realtime 也会再次移除，双重保险）
  const productElement = document.getElementById(`product-${id}`);
  if (productElement) productElement.remove();
  alert('商品已删除');
};

// ==================== 购物车示例 ====================
window.addToCart = function(id) {
  alert("已加入购物车: " + id);
};

// ==================== 工具函数：防 XSS ====================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}


//git add .
//git commit -m "修改说明"
//git push

//D：
//cd D:\pycharm\camera-shop\frontend
